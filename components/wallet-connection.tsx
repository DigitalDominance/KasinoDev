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

// Define a mapping for wallet types with display names and (if needed) icons.
const WALLET_MAP = {
  metamask: {
    name: "MetaMask",
    icon: "/metamask-logo.webp"
  },
  trust: {
    name: "Trust Wallet",
    icon: "/trustwallet-logo.webp"
  },
  phantom: {
    name: "Phantom",
    icon: "/phantom-logo.webp"
  }
};

export function WalletConnection() {
  const { isConnected, connectWallet, disconnectWallet, showNotification } = useWallet();
  const { showModal } = useModal();
  const [isLoading, setIsLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showEvmModal, setShowEvmModal] = useState(false);
  const dropdownRef = useRef(null);

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

  // Toggle dropdown visibility.
  const openWalletOptions = () => setShowOptions((prev) => !prev);
  const closeWalletOptions = () => setShowOptions(false);
  const openEvmWalletModal = () => setShowEvmModal(true);
  const closeEvmWalletModal = () => setShowEvmModal(false);

  // Kasware connection logic remains unchanged.
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

  // EVM wallet connection using injected providers on chrome extensions.
  // This function uses walletType (metamask, trust, phantom) to locate the proper injected provider.
  const handleSelectEvmWallet = async (walletType) => {
    setIsLoading(true);
    closeEvmWalletModal();
    try {
      if (!WALLET_MAP[walletType]) {
        showNotification("Unknown wallet type.", "error");
        setIsLoading(false);
        return;
      }

      let provider;
      // If multiple providers are injected, check window.ethereum.providers array.
      if (window.ethereum && window.ethereum.providers && window.ethereum.providers.length) {
        provider = window.ethereum.providers.find((p) => {
          if (walletType === "metamask") return p.isMetaMask;
          if (walletType === "trust") return p.isTrust || p.isTrustWallet;
          if (walletType === "phantom") return p.isPhantom;
          return false;
        });
      } else if (window.ethereum) {
        // Single injected provider case.
        if (
          (walletType === "metamask" && window.ethereum.isMetaMask) ||
          (walletType === "trust" && (window.ethereum.isTrust || window.ethereum.isTrustWallet)) ||
          (walletType === "phantom" && window.ethereum.isPhantom)
        ) {
          provider = window.ethereum;
        }
      } else if (walletType === "trust" && window.trustwallet) {
        // Trust Wallet also may expose its own provider.
        provider = window.trustwallet;
      }

      if (!provider) {
        showNotification(`${WALLET_MAP[walletType].name} wallet is not installed. Please install it and try again.`, "error");
        setIsLoading(false);
        return;
      }

      // Request accounts from the selected provider.
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        await checkUserAccount(address);
      }
    } catch (error) {
      console.error("Error using injected wallet connection:", error);
      showNotification("Failed to connect EVM wallet. Please try again.", "error");
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
            onClick={() => setShowEvmModal(true)}
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
          </div>
          <button onClick={closeEvmWalletModal} className="mt-4 text-red-400 hover:underline">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
