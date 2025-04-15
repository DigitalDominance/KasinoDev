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

// Mapping wallet IDs (from the API) to their display name and icon.
const WALLET_MAP = {
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96": {
    name: "MetaMask",
    icon: "/metamask-logo.webp"
  },
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0": {
    name: "Trust Wallet",
    icon: "/trustwallet-logo.webp"
  },
  "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393": {
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

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowOptions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Toggle dropdowns.
  const openWalletOptions = () => setShowOptions((prev) => !prev);
  const closeWalletOptions = () => setShowOptions(false);
  const openEvmWalletModal = () => setShowEvmModal(true);
  const closeEvmWalletModal = () => setShowEvmModal(false);

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

  // EVM wallet connection using the injected provider.
  // Uses the wallet id solely for display and identification.
  const handleSelectEvmWallet = async (walletId) => {
    setIsLoading(true);
    closeEvmWalletModal();
    try {
      if (!WALLET_MAP[walletId]) {
        showNotification("Unknown wallet type.", "error");
        setIsLoading(false);
        return;
      }
      const { name } = WALLET_MAP[walletId];

      let provider;
      if (window.ethereum) {
        provider = window.ethereum;
        const accounts = await provider.request({ method: "eth_requestAccounts" });
        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          await checkUserAccount(address);
        }
      } else {
        // Fallback: use WalletConnect's EthereumProvider.
        provider = await EthereumProvider.init({
          projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
          metadata: {
            name: "KasCasino Wallet",
            description: "Wallet for KasCasino",
            url: "https://kasino-dev-38d41436adab.herokuapp.com/",
            icons: ["https://your_wallet_icon.png"]
          },
          optionalChains: [12211],
          rpcMap: {
            12211: "https://www.kasplextest.xyz"
          }
        });

        // Deep linking if needed.
        provider.on("display_uri", (uri) => {
          console.log("Deep link URI:", uri);
          window.location.href = uri;
        });

        const session = await provider.connect();
        if (session && session.accounts && session.accounts.length > 0) {
          const address = session.accounts[0];
          await checkUserAccount(address);
        } else {
          throw new Error("No accounts returned from the session.");
        }
      }
    } catch (error) {
      console.error("Error using wallet connection:", error);
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
              onClick={() => handleSelectEvmWallet("a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393")}
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img src={WALLET_MAP["a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393"].icon} alt="Phantom" className="w-8 h-8 mr-3" />
              <span>{WALLET_MAP["a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393"].name}</span>
            </button>
            <button
              onClick={() =>
                handleSelectEvmWallet("c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96")
              }
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img
                src={WALLET_MAP["c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96"].icon}
                alt="MetaMask"
                className="w-8 h-8 mr-3"
              />
              <span>{WALLET_MAP["c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96"].name}</span>
            </button>
            <button
              onClick={() =>
                handleSelectEvmWallet("4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0")
              }
              className="flex items-center p-2 hover:bg-[#3A3A3A] rounded"
            >
              <img
                src={WALLET_MAP["4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0"].icon}
                alt="Trust Wallet"
                className="w-8 h-8 mr-3"
              />
              <span>{WALLET_MAP["4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0"].name}</span>
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
