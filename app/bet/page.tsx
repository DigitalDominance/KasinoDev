"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { WalletConnection } from "@/components/wallet-connection";
import { XPDisplay } from "@/app/page";
import { Montserrat } from "next/font/google";
import { useWallet } from "@/contexts/WalletContext";

const montserrat = Montserrat({
  weight: "700",
  subsets: ["latin"],
});

// Constants
const HOUSE_EDGE_PERCENT = 5;
const ODDS_API_HOST = "https://api.the-odds-api.com";

// Helper to adjust odds by reducing payout potential (simplified conversion) and then round to 2 decimals.
function adjustOdds(apiOdds: number): number {
  const adjusted = apiOdds * (1 - HOUSE_EDGE_PERCENT / 100);
  return Number(adjusted.toFixed(2));
}

// Preselect the sports we want (popular US sports and then soccer)
// Order: MMA, Boxing, Football (college), NFL, NBA, MLB, Tennis, Soccer
const acceptedSports = [
  "mma_mixed_martial_arts",
  "boxing_boxing",
  "americanfootball_ncaaf",
  "americanfootball_nfl",
  "basketball_nba",
  "baseball_mlb",
  "tennis_atp_us_open",
  "soccer_usa_mls",
];

// Helper: Replace "@" with "vs" when rendering event teams.
function formatEventTeams(away: string, home: string) {
  return `${away} vs ${home}`;
}

export default function BettingPage() {
  const { isConnected, balance } = useWallet();
  const [sports, setSports] = useState<any[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>("mma_mixed_martial_arts");
  const [events, setEvents] = useState<any[]>([]);
  const [resultState, setResultState] = useState<{ eventName: string; winAmount: number; win: boolean } | null>(null);
  const [betModalVisible, setBetModalVisible] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [betAmount, setBetAmount] = useState<number>(0);
  const [myBets, setMyBets] = useState<any[]>([]);
  const [loadingResult, setLoadingResult] = useState(false);

  // Fetch sports from the API on mount then filter to only our accepted list.
  useEffect(() => {
    axios
      .get(`${ODDS_API_HOST}/v4/sports/?apiKey=${process.env.NEXT_PUBLIC_ODDS_API_KEY}`)
      .then((res) => {
        // Filter to those sports that are active and in our accepted list.
        const filtered = res.data.filter(
          (sport: any) =>
            sport.active && acceptedSports.includes(sport.key)
        );
        // Sort according to our defined order:
        filtered.sort(
          (a: any, b: any) =>
            acceptedSports.indexOf(a.key) - acceptedSports.indexOf(b.key)
        );
        setSports(filtered);
        // Set the initially selected sport to the first one in our list.
        if (filtered.length > 0) setSelectedSport(filtered[0].key);
      })
      .catch((err) => console.error("Error fetching sports:", err));
  }, []);

  // Fetch events for the selected sport when it changes.
  useEffect(() => {
    if (!selectedSport) return;
    axios
      .get(
        `${ODDS_API_HOST}/v4/sports/${selectedSport}/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${process.env.NEXT_PUBLIC_ODDS_API_KEY}`
      )
      .then((res) => {
        // For each event, pick our house odd from the first bookmaker & market (assumes that will be our "house" odd).
        const processed = res.data.map((event: any) => {
          // Pick the first outcome's price as the house odd.
          let houseOdd = null;
          if (
            event.bookmakers &&
            event.bookmakers.length &&
            event.bookmakers[0].markets &&
            event.bookmakers[0].markets.length &&
            event.bookmakers[0].markets[0].outcomes &&
            event.bookmakers[0].markets[0].outcomes.length
          ) {
            houseOdd = adjustOdds(event.bookmakers[0].markets[0].outcomes[0].price);
          }
          return { ...event, houseOdd };
        });
        setEvents(processed);
      })
      .catch((err) => console.error("Error fetching events:", err));
  }, [selectedSport]);

  // When bet modal is shown, load any bets the user has placed on this event.
  useEffect(() => {
    async function loadMyBets() {
      if (!selectedEvent || !isConnected) return;
      try {
        const walletAddress = (await window.kasware.getAccounts())[0];
        const res = await axios.get("/api/betting/myBets", {
          params: { walletAddress, eventId: selectedEvent.id },
        });
        if (res.data.success) {
          setMyBets(res.data.bets);
        }
      } catch (err) {
        console.error("Error fetching my bets:", err);
      }
    }
    if (betModalVisible) {
      loadMyBets();
    }
  }, [betModalVisible, selectedEvent, isConnected]);

  // Function to place a bet on an event.
  const placeBet = async () => {
    if (!isConnected) {
      alert("Please connect your wallet");
      return;
    }
    if (betAmount < 1 || betAmount > balance) {
      alert("Invalid bet amount");
      return;
    }
    if (!selectedEvent) return;

    // For demonstration, select the first available outcome from the first bookmaker.
    const chosenOutcome =
      selectedEvent.bookmakers[0].markets[0].outcomes[0].name || "Unknown";
    const odds = adjustOdds(selectedEvent.bookmakers[0].markets[0].outcomes[0].price);

    try {
      const walletAddress = (await window.kasware.getAccounts())[0];
      const res = await axios.post("/api/betting/place", {
        walletAddress,
        eventId: selectedEvent.id,
        sportKey: selectedSport,
        eventName: formatEventTeams(selectedEvent.away_team, selectedEvent.home_team),
        eventCommenceTime: selectedEvent.commence_time,
        betAmount,
        odds,
        chosenOutcome,
      });
      if (res.data.success) {
        setBetModalVisible(false);
        // Update my bets state with the new bet.
        setMyBets((prev) => [
          ...prev,
          {
            eventId: selectedEvent.id,
            eventName: formatEventTeams(selectedEvent.away_team, selectedEvent.home_team),
            betAmount,
            odds,
            chosenOutcome,
          },
        ]);
        // Start polling for the payout outcome
        setTimeout(() => {
          pollBetResult(res.data.betId);
        }, 5000);
      } else {
        alert("Failed to place bet on backend");
      }
    } catch (error: any) {
      console.error("Error placing bet:", error);
      alert("Error placing bet.");
    }
  };

  // Poll for the bet result.
  const pollBetResult = async (betId: string) => {
    setLoadingResult(true);
    try {
      const res = await axios.post("/api/betting/payout", { betId });
      if (res.data.success) {
        setResultState({
          eventName: res.data.bet.eventName,
          winAmount: res.data.bet.winAmount,
          win: res.data.bet.gameResult === "win",
        });
      } else {
        console.error("Bet payout failed:", res.data.message);
      }
    } catch (error: any) {
      console.error("Error resolving bet payout:", error);
    } finally {
      setLoadingResult(false);
    }
  };

  return (
    <div className={`${montserrat.className} min-h-screen bg-black text-white p-6`}>
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Link href="/" className="inline-flex items-center text-[#49EACB] hover:underline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Games
          </Link>
        </motion.div>
        <motion.div
          className="flex items-center gap-4"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <XPDisplay />
          <WalletConnection />
        </motion.div>
      </header>

      {/* Sports Sections */}
      {sports.map((sport) => (
        <section key={sport.key} className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-white">{sport.title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {events
              .filter((event) => event.sport_key === sport.key || (sport.key === selectedSport))
              .map((event) => (
                <Card
                  key={event.id}
                  className="p-4 bg-gray-800 border border-[#49EACB] cursor-pointer hover:bg-gray-700 text-white"
                  onClick={() => {
                    setSelectedEvent(event);
                    setBetModalVisible(true);
                  }}
                >
                  <h3 className="text-xl font-bold">
                    {formatEventTeams(event.away_team, event.home_team)}
                  </h3>
                  <p className="text-sm">
                    Commence Time: {new Date(event.commence_time).toLocaleString()}
                  </p>
                  {/* Show only our house odd rounded to 2 decimals */}
                  <p className="mt-2 text-lg">
                    House Odds:{" "}
                    {event.houseOdd !== null
                      ? (event.houseOdd > 0 ? `+${event.houseOdd}` : event.houseOdd)
                      : "N/A"}
                  </p>
                  {/* Display the user’s bets for this event, if any */}
                  {myBets.filter((bet) => bet.eventId === event.id).length > 0 && (
                    <div className="mt-2 text-sm text-gray-300">
                      <strong>Your Bets:</strong>
                      {myBets
                        .filter((bet) => bet.eventId === event.id)
                        .map((bet, idx) => (
                          <div key={idx}>
                            {bet.betAmount} KAS at odds {bet.odds.toFixed(2)} on {bet.chosenOutcome}
                          </div>
                        ))}
                    </div>
                  )}
                </Card>
              ))}
          </div>
        </section>
      ))}

      {/* Bet Modal */}
      <AnimatePresence>
        {betModalVisible && selectedEvent && (
          <motion.div
            className="fixed inset-0 bg-black/70 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white p-6 rounded-lg w-96 text-black"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="text-2xl mb-4">
                {formatEventTeams(selectedEvent.away_team, selectedEvent.home_team)}
              </h2>
              <p className="mb-2">
                Commence Time: {new Date(selectedEvent.commence_time).toLocaleString()}
              </p>
              <p className="mb-4">
                House Odds:{" "}
                {selectedEvent.houseOdd !== null
                  ? (selectedEvent.houseOdd > 0 ? `+${selectedEvent.houseOdd}` : selectedEvent.houseOdd)
                  : "N/A"}
              </p>
              {/* Render user's existing bets for this event */}
              {myBets.length > 0 && (
                <div className="mb-4 bg-gray-200 p-2 rounded">
                  <h3 className="text-lg font-bold">Your Existing Bets</h3>
                  {myBets.map((bet, idx) => (
                    <div key={idx} className="text-sm">
                      {bet.betAmount} KAS at odds {bet.odds.toFixed(2)} on {bet.chosenOutcome}
                    </div>
                  ))}
                </div>
              )}
              <input
                type="number"
                className="w-full p-2 mb-4"
                placeholder="Bet Amount (KAS)"
                onChange={(e) => setBetAmount(Number(e.target.value))}
              />
              <Button onClick={placeBet} className="w-full bg-black text-white">
                Place Bet
              </Button>
              <Button onClick={() => setBetModalVisible(false)} className="w-full mt-2 bg-black text-white">
                Cancel
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result Notification */}
      <AnimatePresence>
        {resultState && (
          <motion.div
            className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-green-600 p-4 rounded-lg shadow-lg text-center text-white"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            transition={{ duration: 0.5 }}
          >
            {resultState.win ? (
              <div>
                <h2 className="text-xl font-bold">Congratulations!</h2>
                <p>
                  You won on {resultState.eventName} with a payout of {resultState.winAmount} KAS.
                </p>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-bold">Better luck next time!</h2>
                <p>You lost your bet on {resultState.eventName}.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {loadingResult && (
        <div className="fixed bottom-6 right-6 bg-gray-800 p-2 rounded text-white">
          <p>Processing result...</p>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
