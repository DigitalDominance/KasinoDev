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
import { v4 as uuidv4 } from "uuid";

const montserrat = Montserrat({
  weight: "700",
  subsets: ["latin"],
});

// Constants
const HOUSE_EDGE_PERCENT = 5;
const ODDS_API_HOST = "https://api.the-odds-api.com";

// Helper to adjust odds (simplified conversion) and round to 2 decimals.
function adjustOdds(apiOdds: number): number {
  const adjusted = apiOdds * (1 - HOUSE_EDGE_PERCENT / 100);
  return Number(adjusted.toFixed(2));
}

// Accepted sports in desired order.
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

// Helper to format team names (replacing any "@" with "vs").
function formatEventTeams(away: string, home: string) {
  return `${away} vs ${home}`;
}

// Helper: Calculate average odds for each outcome in an event.
// It assumes that each bookmaker provides a h2h market with outcomes; it will average all odds per team.
function calculateAverageOdds(event: any): { [team: string]: number } {
  const oddsMap: { [team: string]: number[] } = {};
  if (event.bookmakers && event.bookmakers.length) {
    event.bookmakers.forEach((bm: any) => {
      if (bm.markets && bm.markets.length) {
        const h2hMarket = bm.markets.find((market: any) => market.key === "h2h");
        if (h2hMarket && h2hMarket.outcomes && h2hMarket.outcomes.length) {
          h2hMarket.outcomes.forEach((outcome: any) => {
            const team = outcome.name;
            const odd = adjustOdds(outcome.price);
            if (!oddsMap[team]) oddsMap[team] = [];
            oddsMap[team].push(odd);
          });
        }
      }
    });
  }
  // Calculate average odds per team:
  const averages: { [team: string]: number } = {};
  for (const team in oddsMap) {
    const sum = oddsMap[team].reduce((a, b) => a + b, 0);
    averages[team] = Number((sum / oddsMap[team].length).toFixed(2));
  }
  return averages;
}

// Group events by their commence date (local date string).
function groupEventsByDate(events: any[]) {
  return events.reduce((grouped: { [key: string]: any[] }, event) => {
    const dateStr = new Date(event.commence_time).toLocaleDateString();
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push(event);
    return grouped;
  }, {});
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
  // For outcome selection in modal:
  const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
  const [depositTxid, setDepositTxid] = useState<string | null>(null);

  // Fetch sports on mount and filter using acceptedSports.
  useEffect(() => {
    axios
      .get(`${ODDS_API_HOST}/v4/sports/?apiKey=${process.env.NEXT_PUBLIC_ODDS_API_KEY}`)
      .then((res) => {
        const filtered = res.data.filter(
          (sport: any) =>
            sport.active && acceptedSports.includes(sport.key)
        );
        filtered.sort(
          (a: any, b: any) =>
            acceptedSports.indexOf(a.key) - acceptedSports.indexOf(b.key)
        );
        setSports(filtered);
        if (filtered.length > 0) setSelectedSport(filtered[0].key);
      })
      .catch((err) => console.error("Error fetching sports:", err));
  }, []);

  // Fetch events for the selected sport.
  useEffect(() => {
    if (!selectedSport) return;
    axios
      .get(
        `${ODDS_API_HOST}/v4/sports/${selectedSport}/odds?regions=us&markets=h2h&oddsFormat=american&apiKey=${process.env.NEXT_PUBLIC_ODDS_API_KEY}`
      )
      .then((res) => {
        // Process each event and calculate average odds.
        const processed = res.data.map((event: any) => {
          const averages = calculateAverageOdds(event);
          return { ...event, avgOdds: averages };
        });
        setEvents(processed);
      })
      .catch((err) => console.error("Error fetching events:", err));
  }, [selectedSport]);

  // When the bet modal is shown, load existing bets for the event.
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
      // Clear any prior outcome selection.
      setSelectedOutcome(null);
    }
  }, [betModalVisible, selectedEvent, isConnected]);

  // Place bet function.
  const placeBet = async () => {
    if (!isConnected) {
      alert("Please connect your wallet");
      return;
    }
    if (betAmount < 1 || betAmount > balance) {
      alert("Invalid bet amount");
      return;
    }
    if (!selectedEvent || !selectedOutcome) {
      alert("Please select an outcome");
      return;
    }

    try {
      const walletAddress = (await window.kasware.getAccounts())[0];
      // Use kasware to send a transaction first, then get the txid.
      // (Replace the following logic with your real kasware integration.)
      const chosenTreasury = "YOUR_TREASURY_ADDRESS"; // Replace with your treasury address logic.
      const depositTx = await window.kasware.sendKaspa(chosenTreasury, betAmount * 1e8, {
        priorityFee: 10000,
      });
      const parsedTx = typeof depositTx === "string" ? JSON.parse(depositTx) : depositTx;
      const txidString = parsedTx.id;
      setDepositTxid(txidString);

      const odds = selectedEvent.avgOdds[selectedOutcome];
      const res = await axios.post("/api/betting/place", {
        walletAddress,
        eventId: selectedEvent.id,
        sportKey: selectedSport,
        eventName: formatEventTeams(selectedEvent.away_team, selectedEvent.home_team),
        eventCommenceTime: selectedEvent.commence_time,
        betAmount,
        odds,
        chosenOutcome: selectedOutcome,
        txid: txidString,
      });
      if (res.data.success) {
        setBetModalVisible(false);
        setMyBets((prev) => [
          ...prev,
          {
            eventId: selectedEvent.id,
            eventName: formatEventTeams(selectedEvent.away_team, selectedEvent.home_team),
            betAmount,
            odds,
            chosenOutcome: selectedOutcome,
          },
        ]);
        // Poll for outcome after delay.
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

  // Poll for bet outcome.
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

  // Group events by commence date.
  const groupedEvents = groupEventsByDate(events);
  const sortedDates = Object.keys(groupedEvents).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  // Modal close handler using an "X" button
  const closeModal = () => setBetModalVisible(false);

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

      {/* Top category buttons */}
      <div className="flex gap-4 mb-6">
        {sports.map((sport) => (
          <Button
            key={sport.key}
            onClick={() => setSelectedSport(sport.key)}
            className={selectedSport === sport.key ? "bg-[#49EACB] text-black" : "bg-gray-800"}
          >
            {sport.title}
          </Button>
        ))}
      </div>

      {/* Sections grouped by Commence Date */}
      {sortedDates.map((dateStr) => (
        <section key={dateStr} className="mb-8">
          <h2 className="text-2xl font-bold mb-4 text-white">{dateStr}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {groupedEvents[dateStr]
              .filter((event: any) =>
                event.sport_key === selectedSport
              )
              .map((event: any) => {
                // Calculate average odds for the two outcomes.
                const averages = calculateAverageOdds(event);
                // Get team names and order them (for a head-to-head, assume two outcomes)
                const teams = Object.keys(averages);
                return (
                  <Card
                    key={event.id}
                    className="p-4 bg-gray-800 border border-[#49EACB] cursor-pointer hover:bg-gray-700 text-white"
                    onClick={() => {
                      setSelectedEvent(event);
                      // Reset any previous selection.
                      setSelectedOutcome(null);
                      setBetModalVisible(true);
                    }}
                  >
                    <h3 className="text-xl font-bold">{formatEventTeams(event.away_team, event.home_team)}</h3>
                    <p className="text-sm">
                      Commence Time: {new Date(event.commence_time).toLocaleString()}
                    </p>
                    <div className="mt-2">
                      {teams.map((team) => (
                        <p key={team} className="text-lg">
                          {team}: {averages[team] > 0 ? (averages[team] > 0 ? `+${averages[team]}` : averages[team]) : "N/A"}
                        </p>
                      ))}
                    </div>
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
                );
              })}
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
              className="bg-gray-800 p-6 rounded-lg w-96 text-white relative"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              transition={{ duration: 0.3 }}
            >
              {/* Close Button (X) */}
              <motion.button
                className="absolute top-2 right-2 text-white"
                onClick={closeModal}
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.9 }}
              >
                &#x2715;
              </motion.button>
              <h2 className="text-2xl mb-4">
                {formatEventTeams(selectedEvent.away_team, selectedEvent.home_team)}
              </h2>
              <p className="mb-2">
                Commence Time: {new Date(selectedEvent.commence_time).toLocaleString()}
              </p>
              <div className="mb-4">
                {/* Get average odds */}
                {(() => {
                  const averages = calculateAverageOdds(selectedEvent);
                  return Object.keys(averages).map((team) => (
                    <p key={team} className="text-lg">
                      {team}: {averages[team] > 0 ? (averages[team] > 0 ? `+${averages[team]}` : averages[team]) : "N/A"}
                    </p>
                  ));
                })()}
              </div>
              {/* Outcome selection buttons */}
              <div className="mb-4 flex gap-4">
                {(() => {
                  const averages = calculateAverageOdds(selectedEvent);
                  return Object.keys(averages).map((team) => (
                    <Button
                      key={team}
                      variant={selectedOutcome === team ? "default" : "outline"}
                      onClick={() => setSelectedOutcome(team)}
                      className="w-full"
                    >
                      {team}: {averages[team] > 0 ? (averages[team] > 0 ? `+${averages[team]}` : averages[team]) : "N/A"}
                    </Button>
                  ));
                })()}
              </div>
              <input
                type="number"
                className="w-full p-2 mb-4 text-black"
                placeholder="Bet Amount (KAS)"
                onChange={(e) => setBetAmount(Number(e.target.value))}
              />
              <Button onClick={placeBet} className="w-full bg-black text-white">
                Place Bet
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

      {/* Custom slider styling, if needed */}
      <style jsx>{`
        .slider-custom {
          -webkit-appearance: none;
          width: 100%;
          height: 10px;
          outline: none;
          border-radius: 5px;
          margin: 10px 0;
        }
        .slider-custom::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 32px;
          height: 32px;
          background: url('/draggerpoint.webp') no-repeat center center;
          background-size: contain;
          cursor: pointer;
        }
        .slider-custom::-moz-range-thumb {
          width: 32px;
          height: 32px;
          background: url('/draggerpoint.webp') no-repeat center center;
          background-size: contain;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
