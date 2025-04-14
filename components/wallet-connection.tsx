"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { debounce } from "underscore";
import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";
import { defineChain } from "@reown/appkit/networks";

import { useWallet, WalletStatus } from "@/contexts/WalletContext";
import { useModal } from "@/contexts/ModalContext";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

// -----------------------------------------------------------------------
// 1. Define your chain (Kasplex Testnet)
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

// -----------------------------------------------------------------------
// 2. React component for wallet connection (Kasware & WalletKit)
export function WalletConnection() {
  // Kasware wallet integration (unchanged)
  const { isConnected, connectWallet, disconnectWallet, showNotification } = useWallet();
  const { showModal } = useModal();

  // State for WalletKit and connected EVM wallet address
  const [walletKit, setWalletKit] = useState<any>(null);
  const [walletKitAddress, setWalletKitAddress] = useState<string | null>(null);

  // UI state for loading and dropdown modals
  const [isLoading, setIsLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showEvmModal, setShowEvmModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Combined connection state: either Kasware or WalletKit is connected.
  const isWalletConnected = isConnected || Boolean(walletKitAddress);

  // ---------------------------------------------------------------------
  // Helper functions to show or close the wallet options dropdown.
  const openWalletOptions = () => setShowOptions((prev) => !prev);
  const closeWalletOptions = () => {
    setShowOptions(false);
    setShowEvmModal(false);
  };

  // ---------------------------------------------------------------------
  // Initialization: create a Core instance with your project ID and initialize WalletKit.
  useEffect(() => {
    async function initWalletKit() {
      try {
        const core = new Core({
          projectId: process.env.NEXT_PUBLIC_PROJECT_ID || "",
        });
        const instance = await WalletKit.init({
          core,
          metadata: {
            name: "Kascasino Wallet",
            description: "Kascasino Wallet to interface with decentralized applications",
            url: typeof window !== "undefined" ? window.location.origin : "https://www.kascasino.xyz/",
            icons: ["https://www.kascasino.xyz/logo.png"],
            redirect: { native: "kascasino://" },
          },
        });
        setWalletKit(instance);
      } catch (error) {
        console.error("Failed to initialize WalletKit:", error);
      }
    }
    initWalletKit();
  }, []);

  // ---------------------------------------------------------------------
  // Automatic Pairing: if a pairing URI is provided via the URL (query parameter "wc"),
  // attempt to pair automatically.
  useEffect(() => {
    if (!walletKit) return;
    const searchParams = new URLSearchParams(window.location.search);
    const pairingUri = searchParams.get("wc");
    if (pairingUri) {
      (async () => {
        try {
          await walletKit.pair({ uri: pairingUri });
          // Optionally, remove the pairing URI from the URL after successful pairing.
        } catch (error) {
          console.error("Automatic pairing failed:", error);
          showNotification("Pairing failed. Please try again.", "error");
        }
      })();
    }
  }, [walletKit, showNotification]);

  // ---------------------------------------------------------------------
  // Session Proposal Handling: when a session proposal is received, build approved namespaces and approve.
  useEffect(() => {
    if (!walletKit) return;
    const onSessionProposal = async (proposal: any) => {
      try {
        const approvedNamespaces = buildApprovedNamespaces({
          proposal: proposal.params,
          supportedNamespaces: {
            eip155: {
              chains: ["eip155:12211"],
              methods: [
                "eth_sendTransaction",
                "personal_sign",
                "eth_sign",
                "eth_signTypedData",
                "eth_signTransaction",
                "wallet_switchEthereumChain",
                "wallet_addEthereumChain",
              ],
              events: ["chainChanged", "accountsChanged"],
              accounts: walletKitAddress ? [`eip155:12211:${walletKitAddress}`] : [],
            },
          },
        });

        const session = await walletKit.approveSession({
          id: proposal.id,
          namespaces: approvedNamespaces,
        });

        if (session.namespaces && session.namespaces.eip155?.accounts.length > 0) {
          const parts = session.namespaces.eip155.accounts[0].split(":");
          setWalletKitAddress(parts[2]);
        }
      } catch (error) {
        console.error("Session proposal error", error);
        await walletKit.rejectSession({
          id: proposal.id,
          reason: getSdkError("USER_REJECTED"),
        });
      }
    };

    walletKit.on("session_proposal", onSessionProposal);
    return () => walletKit.off("session_proposal", onSessionProposal);
  }, [walletKit, walletKitAddress]);

  // ---------------------------------------------------------------------
  // EVM Wallet Connection via WalletKit: when a user selects an EVM wallet,
  // retrieve the pairing URI from the URL automatically and call pair().
  const handleSelectEvmWallet = async (
    walletType: "metamask" | "phantom" | "trust" | "uniswap"
  ) => {
    let walletId: string | undefined;
    switch (walletType) {
      case "metamask":
        walletId = "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96";
        break;
      case "phantom":
        walletId = "a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393";
        break;
      case "trust":
        walletId = "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0";
        break;
      case "uniswap":
        walletId = "c03dfee351b6fcc421b4494ea33b9d4b92a984f87aa76d1663bb28705e95034a";
        break;
      default:
        walletId = undefined;
    }
    setIsLoading(true);
    closeWalletOptions();
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const pairingUri = searchParams.get("wc");
      if (!pairingUri) {
        // Instead of throwing an error, show a notification so pairing can be re‑triggered by a proper dapp deep link.
        showNotification("No pairing URI found. Ensure the dapp provides one automatically.", "error");
        setIsLoading(false);
        return;
      }
      await walletKit.pair({ uri: pairingUri, includeWalletIds: walletId ? [walletId] : undefined });
      // When pairing succeeds, session proposal events will update walletKitAddress.
    } catch (error) {
      console.error("Error during WalletKit pairing:", error);
      showNotification("Failed to connect EVM wallet. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const openEvmWalletModal = () => setShowEvmModal(true);

  // ---------------------------------------------------------------------
  // Kasware Connection Logic (unchanged)
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

  // ---------------------------------------------------------------------
  // Backend Account Verification: once connected, verify the user's account.
  useEffect(() => {
    if (walletKitAddress) {
      checkUserAccount(walletKitAddress);
    }
  }, [walletKitAddress]);

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

  // ---------------------------------------------------------------------
  // Kasware Network Verification (unchanged)
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

  // ---------------------------------------------------------------------
  // Disconnect Logic: disconnect both Kasware and WalletKit sessions.
  const disconnectWalletKit = async () => {
    if (walletKit) {
      try {
        await walletKit.disconnectSession({
          reason: { code: 0, message: "User disconnected" },
        });
        setWalletKitAddress(null);
      } catch (error) {
        console.error("Error disconnecting WalletKit session:", error);
      }
    }
  };

  const handleDisconnect = useCallback(
    debounce(async () => {
      setIsLoading(true);
      try {
        if (isConnected) {
          await disconnectWallet();
        }
        if (walletKitAddress) {
          await disconnectWalletKit();
        }
      } catch (error) {
        showNotification("Failed to disconnect wallet. Please try again.", "error");
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [disconnectWallet, walletKitAddress, isConnected, showNotification]
  );

  // ---------------------------------------------------------------------
  // Render Component UI
  return (
    <div className="flex items-center space-x-4 relative">
      <WalletStatus />
      {!isWalletConnected ? (
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
          <div className="flex items-center cursor-pointer hover:bg-[#3A3A3A] p-2 rounded transition-all" onClick={handleKaswareConnect}>
            <img src="/kaswarelogo.webp" alt="Kasware Wallet" className="w-8 h-8 mr-3" />
            <span>Kasware Wallet</span>
          </div>
          <div className="flex items-center cursor-pointer hover:bg-[#3A3A3A] p-2 rounded transition-all mt-2" onClick={() => setShowEvmModal(true)}>
            <img src="/walletconnectlogo.webp" alt="EVM Wallet (WalletKit)" className="w-8 h-8 mr-3" />
            <span>EVM Wallet (WalletKit)</span>
          </div>
          {showEvmModal && (
            <div className="mt-2">
              <h3 className="text-md font-semibold mb-2">Select EVM Wallet</h3>
              <div className="flex flex-col space-y-2">
                <button onClick={() => handleSelectEvmWallet("phantom")} className="flex items-center p-2 hover:bg-[#3A3A3A] rounded" disabled={isLoading}>
                  <img src="/phantom-logo.webp" alt="Phantom" className="w-8 h-8 mr-3" />
                  <span>Phantom</span>
                </button>
                <button onClick={() => handleSelectEvmWallet("metamask")} className="flex items-center p-2 hover:bg-[#3A3A3A] rounded" disabled={isLoading}>
                  <img src="/metamask-logo.webp" alt="MetaMask" className="w-8 h-8 mr-3" />
                  <span>MetaMask</span>
                </button>
                <button onClick={() => handleSelectEvmWallet("trust")} className="flex items-center p-2 hover:bg-[#3A3A3A] rounded" disabled={isLoading}>
                  <img src="/trustwallet-logo.webp" alt="Trust Wallet" className="w-8 h-8 mr-3" />
                  <span>Trust Wallet</span>
                </button>
                <button onClick={() => handleSelectEvmWallet("uniswap")} className="flex items-center p-2 hover:bg-[#3A3A3A] rounded" disabled={isLoading}>
                  <img src="/uniswap-logo.webp" alt="Uniswap Wallet" className="w-8 h-8 mr-3" />
                  <span>Uniswap Wallet</span>
                </button>
              </div>
              <button onClick={() => setShowEvmModal(false)} className="mt-2 text-red-400 hover:underline">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
