"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, WalletStatus } from "@/contexts/WalletContext";
import { useModal } from "@/contexts/ModalContext";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { debounce } from "underscore";
import { createAppKit } from "@walletconnect/appkit";
import { mainnet } from "@wagmi/core/chains";
import * as Clipboard from "expo-clipboard";

// Create WalletConnect AppKit instance with your desired configuration
const evmWalletConnect = createAppKit({
  projectId: "YOUR_PROJECT_ID", // Replace with your actual WalletConnect project id
  chains: [mainnet],
  defaultChain: mainnet,
  clipboardClient: {
    setString: async (value) => {
      await Clipboard.setStringAsync(value);
    },
  },
  customWallets: [
    {
      id: "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393", // Phantom
      name: "Phantom",
      homepage: "https://www.phantom.app",
      mobile_link: "", // Optionally provide a deeplink or universal link
      link_mode: "universal_link",
      desktop_link: "",
      webapp_link: "",
      app_store: "",
      play_store: "",
    },
    {
      id: "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
      name: "MetaMask",
      homepage: "https://metamask.io",
      mobile_link: "",
      link_mode: "universal_link",
      desktop_link: "",
      webapp_link: "",
      app_store: "",
      play_store: "",
    },
    {
      id: "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
      name: "Trust Wallet",
      homepage: "https://trustwallet.com",
      mobile_link: "",
      link_mode: "universal_link",
      desktop_link: "",
      webapp_link: "",
      app_store: "",
      play_store: "",
    },
    {
      id: "c03dfee351b6fcc421b4494ea33b9d4b92a984f87aa76d1663bb28705e95034a", // Uniswap Wallet
      name: "Uniswap Wallet",
      homepage: "https://uniswap.org",
      mobile_link: "",
      link_mode: "universal_link",
      desktop_link: "",
      webapp_link: "",
      app_store: "",
      play_store: "",
    },
  ],
  debug: true,
  features: {
    swaps: true,
    email: true,
    socials: ["x", "discord", "apple"],
    emailShowWallets: false,
  },
  enableAnalytics: true,
  chainImages: {
    1: "https://my.images.com/eth.png",
  },
  connectorImages: {
    coinbaseWallet: "https://images.mydapp.com/coinbase.png",
    walletConnect: "https://images.mydapp.com/walletconnect.png",
    appKitAuth: "https://images.mydapp.com/auth.png",
  },
});

export function WalletConnection() {
  const { isConnected, connectWallet, disconnectWallet, showNotification } = useWallet();
  const { showModal } = useModal();
  const [isLoading, setIsLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showEvmModal, setShowEvmModal] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside.
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowOptions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Toggles for wallet options.
  const openWalletOptions = () => setShowOptions((prev) => !prev);
  const closeWalletOptions = () => setShowOptions(false);
  const openEvmWalletModal = () => setShowEvmModal(true);
  const closeEvmWalletModal = () => setShowEvmModal(false);

  // Kasware connection remains unchanged.
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

  // EVM connection handler using WalletConnect AppKit.
  // The walletId parameter corresponds to the IDs provided in the AppKit configuration.
  const handleSelectEvmWallet = async (walletId) => {
    setIsLoading(true);
    closeEvmWalletModal();

    try {
      // Initiate the connection using the WalletConnect AppKit instance
      const result = await evmWalletConnect.connect({ walletId });
      if (result && result.accounts && result.accounts.length > 0) {
        const address = result.accounts[0];
        await checkUserAccount(address);
      } else {
        showNotification("No account found. Please try again.", "error");
      }
    } catch (error) {
      console.error("Error connecting via WalletConnect AppKit:", error);
      showNotification("Failed to connect wallet via WalletConnect. Please try again.", "error");
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
        await disconnectWallet();
      } catch (error) {
        showNotification("Failed to disconnect wallet. Please try again.", "error");
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [disconnectWallet, showNotification]
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
              onClick={() =>
                handleSelectEvmWallet("a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393")
              }
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img src="/phantom-logo.webp" alt="Phantom" className="w-8 h-8 mr-3" />
              <span>Phantom</span>
            </button>
            <button
              onClick={() =>
                handleSelectEvmWallet("c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96")
              }
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img src="/metamask-logo.webp" alt="MetaMask" className="w-8 h-8 mr-3" />
              <span>MetaMask</span>
            </button>
            <button
              onClick={() =>
                handleSelectEvmWallet("4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0")
              }
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img src="/trustwallet-logo.webp" alt="Trust Wallet" className="w-8 h-8 mr-3" />
              <span>Trust Wallet</span>
            </button>
            <button
              onClick={() =>
                handleSelectEvmWallet("c03dfee351b6fcc421b4494ea33b9d4b92a984f87aa76d1663bb28705e95034a")
              }
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
