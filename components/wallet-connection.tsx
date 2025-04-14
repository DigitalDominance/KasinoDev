"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, WalletStatus } from "@/contexts/WalletContext";
import { useModal } from "@/contexts/ModalContext";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { debounce } from "underscore";
import { siweConfig } from "./siweConfig";
import { defineChain } from "@reown/appkit/networks";

// Import WalletKit hook from Reown WalletKit (this is the new integration)
// Ensure that you have installed and set up the WalletKit provider in your app root.
import { useWalletKit } from "@reown/walletkit/react";

// 1. Define the Kasplex Testnet chain (chain ID 12211) using defineChain
const kasplexTestnet = defineChain({
  id: 12211,
  caipNetworkId: "eip155:12211",
  chainNamespace: "eip155",
  name: "Kasplex Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Kasplex Testnet Coin",
    symbol: "KAS",
  },
  rpcUrls: {
    default: { http: ["https://www.kasplextest.xyz"] },
  },
  blockExplorers: {
    default: { name: "Kasplex Explorer", url: "https://explorer.kasplex.org" },
  },
});

export function WalletConnection() {
  // Context from your Kasware integration
  const { isConnected, connectWallet, disconnectWallet, showNotification } = useWallet();
  const { showModal } = useModal();

  // WalletKit hook – this handles EVM wallet connection via Reown WalletKit
  const { openModal: openWalletKitModal, address: walletKitAddress } = useWalletKit();

  const [isLoading, setIsLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 2. Dropdown: auto-close if clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openWalletOptions = () => setShowOptions((prev) => !prev);
  const closeWalletOptions = () => setShowOptions(false);

  // 3. Kasware connection logic remains unchanged.
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

  // 4. EVM wallet connection via WalletKit.
  // When the user selects “EVM Wallet (WalletKit)”, we simply call openWalletKitModal,
  // which will trigger the WalletKit modal listing your four supported wallets.
  const handleEvmWalletConnect = async () => {
    closeWalletOptions();
    if (!openWalletKitModal) {
      showNotification("WalletKit is not initialized.", "error");
      return;
    }
    try {
      setIsLoading(true);
      await openWalletKitModal();
      // The modal will handle the wallet selection.
      // Once connected, the walletKitAddress will be updated.
    } catch (error) {
      console.error("Error opening WalletKit modal:", error);
      showNotification("Failed to open wallet modal. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Once the user connects with an EVM wallet via WalletKit,
  // we automatically check their backend account.
  useEffect(() => {
    if (walletKitAddress) {
      // You may wish to add additional checks (e.g. network verification) here.
      checkUserAccount(walletKitAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletKitAddress]);

  // 6. Backend account check (same for both Kasware and WalletKit connections)
  const checkUserAccount = async (address: string) => {
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

  // 7. Network verification for Kasware (unchanged)
  const checkNetwork = async () => {
    const kasware = (window as any).kasware;
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

  // 8. Disconnect logic remains unchanged.
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
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              "Connect Wallet"
            )}
          </Button>
        </motion.div>
      ) : (
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button
            onClick={handleDisconnect}
            disabled={isLoading}
            className="bg-gradient-to-r from-[#49EACB] to-[#49EACB]/80 hover:opacity-90 text-black font-semibold"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              "Disconnect"
            )}
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
            <img src="/walletconnectlogo.webp" alt="EVM Wallet (WalletKit)" className="w-8 h-8 mr-3" />
            <span>EVM Wallet (WalletKit)</span>
          </div>
        </div>
      )}
    </div>
  );
}
