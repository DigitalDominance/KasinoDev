"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, WalletStatus } from "@/contexts/WalletContext";
import { useModal } from "@/contexts/ModalContext";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { debounce } from "underscore";
import { siweConfig } from "./siweConfig";
import { createAppKit } from "@reown/appkit/react";
import { createEthereumAdapter } from "@reown/appkit-adapter-ethers";

export function WalletConnection() {
  const { isConnected, connectWallet, disconnectWallet, showNotification } = useWallet();
  const { showModal } = useModal();
  const [isLoading, setIsLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const dropdownRef = useRef(null);
  const [wcProvider, setWcProvider] = useState(null);
  // Ref for storing the initialized AppKit instance
  const appKitRef = useRef(null);

  // Initialize Reown AppKit (with extra options to configure the wallet modal)
  useEffect(() => {
    const initReownAppKit = async () => {
      try {
        // Create Ethereum adapter with your RPC chain details and wallet IDs
        const ethereumAdapter = createEthereumAdapter({
          projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
          chains: [
            {
              id: 12211,
              name: "Kasplex Testnet",
              rpcUrl: "https://www.kasplextest.xyz",
              nativeCurrency: {
                name: "KAS",
                symbol: "KAS",
                decimals: 18,
              },
            },
          ],
          wallets: [
            { id: "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393" }, // Phantom (if applicable)
            { id: "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96" }, // MetaMask
            { id: "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0" }, // Trust Wallet
            { id: "c03dfee351b6fcc421b4494ea33b9d4b92a984f87aa76d1663bb28705e95034a" }  // Uniswap
          ]
        });

        // Create AppKit with additional configuration options including:
        // - defaultChain (your Kasplex testnet)
        // - featuredWalletIds (to prioritize the four wallets in the modal)
        // - debug mode and extra feature toggles
        // - connectorImages to override default images
        const appKit = createAppKit({
          projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
          adapters: [ethereumAdapter],
          metadata: {
            name: "KasCasino Wallet",
            description: "Wallet for KasCasino",
            url: "https://kasino-dev-38d41436adab.herokuapp.com",
            icons: ["https://your_wallet_icon.png"],
          },
          themeMode: "dark",
          themeVariables: {
            "--w3m-accent": "#49EACB",
          },
          defaultChain: {
            id: 12211,
            name: "Kasplex Testnet",
            rpcUrl: "https://www.kasplextest.xyz",
            nativeCurrency: {
              name: "KAS",
              symbol: "KAS",
              decimals: 18,
            },
          },
          featuredWalletIds: [
            "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", // Phantom
            "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
            "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
            "c03dfee351b6fcc421b4494ea33b9d4b92a984f87aa76d1663bb28705e95034a"  // Uniswap
          ],
          debug: true,
          features: {
            swaps: true,
            email: false,     // disable email login if not needed
            socials: [],      // disable socials by passing an empty array
            emailShowWallets: true,
          },
          connectorImages: {
            coinbaseWallet: "https://images.mydapp.com/coinbase.png",
            walletConnect: "https://images.mydapp.com/walletconnect.png",
            appKitAuth: "https://images.mydapp.com/auth.png",
          },
        });

        // Store the appKit instance so its methods can be used later (e.g. to open the modal)
        appKitRef.current = appKit;

        // Optionally get the underlying Ethereum provider (if needed for direct interactions)
        const provider = await ethereumAdapter.getProvider();
        setWcProvider(provider);
      } catch (error) {
        console.error("Failed to initialize Reown AppKit:", error);
      }
    };

    initReownAppKit();
  }, []);

  // Close the main dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowOptions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Toggle main dropdown.
  const openWalletOptions = () => {
    setShowOptions((prev) => !prev);
  };

  const closeWalletOptions = () => {
    setShowOptions(false);
  };

  // Kasware connection logic (remains unchanged)
  const handleKaswareConnect = async () => {
    setIsLoading(true);
    closeWalletOptions();
    try {
      const address = await connectWallet();
      if (address) {
        const isCorrectNetwork = await checkNetwork();
        if (isCorrectNetwork) {
          await checkUserAccount(address);
        }
      }
    } catch (error) {
      showNotification("Failed to connect wallet. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // EVM wallet connection using Reown AppKit modal
  const handleEvmWalletConnect = async () => {
    closeWalletOptions();
    if (!appKitRef.current) {
      showNotification("Wallet connection module is not initialized.", "error");
      return;
    }
    try {
      setIsLoading(true);
      // Open the built-in Reown AppKit modal so the user can choose one of the
      // featured (or custom) EVM wallets. This replaces the custom EVM wallet modal.
      await appKitRef.current.openModal();
    } catch (error) {
      console.error("Error opening EVM wallet modal:", error);
      showNotification("Failed to open wallet modal. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Check user account on backend.
  const checkUserAccount = async (address) => {
    try {
      const response = await fetch(`/api/user?walletAddress=${address}`);
      if (response.ok) {
        const userData = await response.json();
        if (userData) {
          showModal("login", address);
        } else {
          showModal("account-creation", address);
        }
      } else {
        throw new Error("Failed to check user account");
      }
    } catch (error) {
      console.error("Error checking user account:", error);
      showNotification("Error checking user account. Please try again.", "error");
    }
  };

  // Check Kasware network.
  const checkNetwork = async () => {
    const kasware = window.kasware;
    if (kasware) {
      try {
        const network = await kasware.getNetwork();
        if (network !== "kaspa_mainnet") {
          showNotification("Please switch to the Kaspa mainnet to play.", "error");
          await disconnectWallet();
          return false;
        }
        return true;
      } catch (error) {
        console.error("Failed to check network:", error);
        showNotification("Failed to check network. Please try again.", "error");
        return false;
      }
    }
    return false;
  };

  // Disconnect logic with debounce.
  const handleDisconnect = useCallback(
    debounce(async () => {
      setIsLoading(true);
      try {
        // If the WalletConnect provider was used and supports disconnect, call it.
        if (wcProvider && wcProvider.connected && wcProvider.disconnect) {
          await wcProvider.disconnect();
        }
        await disconnectWallet();
      } catch (error) {
        showNotification("Failed to disconnect wallet. Please try again.", "error");
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [disconnectWallet, showNotification, wcProvider]
  );

  return (
    <div className="flex items-center space-x-4 relative">
      <WalletStatus />
      {!isConnected ? (
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            onClick={openWalletOptions}
            disabled={isLoading}
            className="bg-gradient-to-r from-[#49EACB] to-[#49EACB]/80 hover:opacity-90 text-black font-semibold"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Connect Wallet"}
          </Button>
        </motion.div>
      ) : (
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            onClick={handleDisconnect}
            disabled={isLoading}
            className="bg-gradient-to-r from-[#49EACB] to-[#49EACB]/80 hover:opacity-90 text-black font-semibold"
          >
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Disconnect"}
          </Button>
        </motion.div>
      )}
      {showOptions && (
        <div
          ref={dropdownRef}
          className="absolute top-full right-0 mt-2 w-64 z-50 bg-[#2F2F2F] text-white rounded-md shadow-lg p-4"
        >
          <h2 className="text-lg font-semibold mb-3">Choose Wallet Type</h2>
          <div
            className="flex items-center cursor-pointer hover:bg-[#3A3A3A] p-2 rounded transition-all"
            onClick={handleKaswareConnect}
          >
            <img src="/kaswarelogo.webp" alt="Kasware Wallet" className="w-8 h-8 mr-3" />
            <span>Kasware Wallet</span>
          </div>
          <div
            className="flex items-center cursor-pointer hover:bg-[#3A3A3A] p-2 rounded transition-all mt-2"
            onClick={handleEvmWalletConnect}
          >
            <img src="/walletconnectlogo.webp" alt="EVM Wallet (WalletConnect)" className="w-8 h-8 mr-3" />
            <span>EVM Wallet (WalletConnect)</span>
          </div>
        </div>
      )}

      {/* Render the AppKit button (this can serve as an alternate way to trigger the modal) */}
      <appkit-button />
    </div>
  );
}
