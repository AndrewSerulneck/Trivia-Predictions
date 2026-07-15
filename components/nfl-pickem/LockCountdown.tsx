"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export function LockCountdown({ lockTime }: { lockTime: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState(false);
  
  useEffect(() => {
    const lockDate = new Date(lockTime).getTime();
    
    const updateTimer = () => {
      const now = Date.now();
      const diff = lockDate - now;
      
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft(0);
      } else {
        setTimeLeft(diff);
        setIsExpired(false);
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [lockTime]);
  
  if (isExpired) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-lg border border-rose-500/45 bg-rose-950/30 px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🔒</span>
          <span className="text-[14px] font-black text-rose-400">
            PICKS ARE NOW LOCKED
          </span>
        </div>
      </motion.div>
    );
  }
  
  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
  
  const isUrgent = timeLeft < 60 * 60 * 1000; // Less than 1 hour
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg border px-4 py-3 ${
        isUrgent 
          ? "border-rose-400/45 bg-rose-950/30" 
          : "border-amber-400/45 bg-amber-950/30"
      }`}
    >
      <div className={`text-[10px] font-bold uppercase tracking-[0.1em] ${
        isUrgent ? "text-rose-400" : "text-amber-300"
      }`}>
        ⏰ Picks Lock In
      </div>
      
      <div className={`mt-1 font-black tabular-nums ${
        isUrgent ? "text-[22px] text-rose-400" : "text-[20px] text-amber-400"
      }`}>
        {days > 0 && <span>{days}d </span>}
        <span>{String(hours).padStart(2, "0")}</span>
        <span className="animate-pulse">:</span>
        <span>{String(minutes).padStart(2, "0")}</span>
        <span className="animate-pulse">:</span>
        <span>{String(seconds).padStart(2, "0")}</span>
      </div>
      
      <div className={`text-[10px] ${isUrgent ? "text-rose-300" : "text-amber-300/70"}`}>
        {new Date(lockTime).toLocaleString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
    </motion.div>
  );
}
