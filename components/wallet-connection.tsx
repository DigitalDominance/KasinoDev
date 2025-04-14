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

// Helper to choose the injected provider based on the desired wallet type.
// If multiple providers are injected (via window.ethereum.providers) then the one matching
// the desired wallet type (e.g. metamask or phantom) is returned.
// Otherwise, if only one provider is available, we check if it matches the desired type.
const getInjectedProvider = (walletType) => {
  if (typeof window === "undefined" || !window.ethereum) return null;

  const eth = window.ethereum;
  let provider = null;
  
  // If multiple providers exist, choose the one matching the wallet type.
  if (eth.providers && Array.isArray(eth.providers)) {
    if (walletType === "metamask") {
      provider = eth.providers.find((p) => p.isMetaMask);
    } else if (walletType === "phantom") {
      provider = eth.providers.find((p) => p.isPhantom);
    } else if (walletType === "trust") {
      provider = eth.providers.find((p) => p.isTrust);
    } else if (walletType === "uniswap") {
      provider = eth.providers.find((p) => p.isUniswap);
    }
  } else {
    // Only one provider exists. Check that it matches the desired type.
    if (
      (walletType === "metamask" && eth.isMetaMask) ||
      (walletType === "phantom" && eth.isPhantom) ||
      (walletType === "trust" && eth.isTrust) ||
      (walletType === "uniswap" && eth.isUniswap)
    ) {
      provider = eth;
    }
  }
  return provider;
};

export function WalletConnection() {
  const { isConnected, connectWallet, disconnectWallet, showNotification } = useWallet();
  const { showModal } = useModal();
  const [isLoading, setIsLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showEvmModal, setShowEvmModal] = useState(false);
  // Track the selected EVM wallet type.
  const [selectedEvmWalletType, setSelectedEvmWalletType] = useState(null);
  const dropdownRef = useRef(null);

  // Close dropdown if clicking outside.
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowOptions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Toggles for options.
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

  // EVM connection handler using the proper injected provider.
  const handleSelectEvmWallet = async (walletType) => {
    setIsLoading(true);
    closeEvmWalletModal();

    // If switching wallet types, disconnect any prior wallet.
    if (selectedEvmWalletType && selectedEvmWalletType !== walletType) {
      await disconnectWallet();
      setSelectedEvmWalletType(null);
    }
    setSelectedEvmWalletType(walletType);

    try {
      const provider = getInjectedProvider(walletType);
      if (!provider) {
        showNotification(`${walletType} provider not found.`, "error");
        setIsLoading(false);
        return;
      }
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        await checkUserAccount(address);
      }
    } catch (error) {
      console.error("Error using injected provider for EVM wallet connection:", error);
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
        setSelectedEvmWalletType(null);
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
