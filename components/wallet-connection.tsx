"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, WalletStatus } from "@/contexts/WalletContext";
import { useModal } from "@/contexts/ModalContext";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { debounce } from "underscore";
import { siweConfig } from "./siweConfig";
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { AppKit } from "@reown/appkit";

export function WalletConnection() {
  const { isConnected, connectWallet, disconnectWallet, showNotification } = useWallet();
  const { showModal } = useModal();
  const [isLoading, setIsLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showEvmModal, setShowEvmModal] = useState(false);
  const dropdownRef = useRef(null);
  const [wcProvider, setWcProvider] = useState(null);

  // Initialize Reown AppKit
  useEffect(() => {
    const initReownAppKit = async () => {
      try {
        // Create a new instance of AppKit with the correct configuration
        const appKit = new AppKit({
          projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
          metadata: {
            name: "KasCasino Wallet",
            description: "Wallet for KasCasino",
            url: "https://kasino-dev-38d41436adab.herokuapp.com",
            icons: ["https://your_wallet_icon.png"],
          },
          chains: [{
            id: 12211,
            name: "Kasplex Testnet",
            rpcUrl: "https://www.kasplextest.xyz",
            nativeCurrency: {
              name: "KAS",
              symbol: "KAS",
              decimals: 18,
            },
          }],
          wallets: [
            // Phantom
            {id: "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393"},
            // MetaMask
            {id: "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96"},
            // Trust Wallet
            {id: "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0"},
            // Uniswap Wallet
            {id: "c03dfee351b6fcc421b4494ea33b9d4b92a984f87aa76d1663bb28705e95034a"}
          ],
        });
        
        // Initialize the AppKit
        await appKit.initialize();
        
        // Get the Ethereum provider
        const provider = await appKit.getEthereumProvider();
        setWcProvider(provider);
      } catch (error) {
        console.error("Failed to initialize Reown AppKit:", error);
      }
    };

    initReownAppKit();
  }, []);

  // Close the main dropdown when clicking outside.
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

  // Toggle EVM wallet sub-dropdown.
  const openEvmWalletModal = () => {
    setShowEvmModal(true);
  };

  const closeEvmWalletModal = () => {
    setShowEvmModal(false);
  };

  // Kasware connection logic (remains unchanged).
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

  // EVM wallet connection using Reown AppKit
  const handleSelectEvmWallet = async (walletType) => {
    setIsLoading(true);
    closeEvmWalletModal();
    closeWalletOptions();
    
    try {
      if (!wcProvider) {
        throw new Error("WalletConnect provider not initialized");
      }
      
      // Connect to the specific wallet based on walletType
      let walletId;
      switch (walletType) {
        case "phantom":
          walletId = "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393";
          break;
        case "metamask":
          walletId = "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96";
          break;
        case "trust":
          walletId = "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0";
          break;
        case "uniswap":
          walletId = "c03dfee351b6fcc421b4494ea33b9d4b92a984f87aa76d1663bb28705e95034a";
          break;
        default:
          throw new Error("Invalid wallet type");
      }
      
      // Connect with the specific wallet
      await wcProvider.connect({
        walletId: walletId,
      });
      
      // Request accounts
      const accounts = await wcProvider.request({ method: "eth_requestAccounts" });
      
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        
        // Switch to Kasplex network
        await wcProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x2FB3" }], // 12211 in hex
        });
        
        await checkUserAccount(address);
      } else {
        throw new Error("No accounts returned");
      }
    } catch (error) {
      console.error(`Error connecting to ${walletType} wallet:`, error);
      showNotification(`Failed to connect ${walletType} wallet. Please try again.`, "error");
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
        // Disconnect WalletConnect if it was used
        if (wcProvider && wcProvider.connected) {
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
            onClick={openEvmWalletModal}
          >
            <img src="/walletconnectlogo.webp" alt="EVM Wallet (WalletConnect)" className="w-8 h-8 mr-3" />
            <span>EVM Wallet (WalletConnect)</span>
          </div>
        </div>
      )}
      {showEvmModal && (
        <div className="absolute top-full right-0 mt-2 w-64 z-50 bg-[#2F2F2F] text-white rounded-md shadow-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Select EVM Wallet</h2>
          <div className="flex flex-col space-y-3">
            <button
              onClick={() => handleSelectEvmWallet("phantom")}
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img src="/phantom-logo.webp" alt="Phantom" className="w-8 h-8 mr-3" />
              <span>Phantom</span>
            </button>
            <button
              onClick={() => handleSelectEvmWallet("metamask")}
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img src="/metamask-logo.webp" alt="MetaMask" className="w-8 h-8 mr-3" />
              <span>MetaMask</span>
            </button>
            <button
              onClick={() => handleSelectEvmWallet("trust")}
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img src="/trustwallet-logo.webp" alt="Trust Wallet" className="w-8 h-8 mr-3" />
              <span>Trust Wallet</span>
            </button>
            <button
              onClick={() => handleSelectEvmWallet("uniswap")}
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img src="/uniswap-logo.webp" alt="Uniswap Wallet" className="w-8 h-8 mr-3" />
              <span>Uniswap Wallet</span>
            </button>
          </div>
          <button onClick={closeEvmWalletModal} className="mt-4 text-red-400 hover:underline">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
