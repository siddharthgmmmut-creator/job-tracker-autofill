/**
 * useScrapeTrigger
 *
 * Handles the full Scrape Now lifecycle:
 *   trigger() → fire API → poll /scrape/status every 3 s
 *             → toast with result → callback (e.g. refreshOverview)
 *
 * Polling stops when:
 *   - scrape.running === false  AND
 *   - scrape.finishedAt is after the moment we clicked (avoids reacting to
 *     a stale previous run that already had a result)
 *
 * Safety timeout: 25 minutes (gives full expanded scrape enough runway).
 */

import { useState, useRef, useCallback } from 'react';
import { settingsApi } from '../api';
import { useApp } from '../context/AppContext';
import toast from 'react-hot-toast';

const POLL_INTERVAL_MS = 3_000;
const SAFETY_TIMEOUT_MS = 25 * 60 * 1000;

export function useScrapeTrigger() {
  const [scraping,    setScraping]    = useState(false);
  const [elapsedSec,  setElapsedSec]  = useState(0);
  const pollRef    = useRef(null);
  const timerRef   = useRef(null);
  const activeRef  = useRef(false);         // track active run without stale-closure risk
  const { refreshOverview } = useApp();

  // ── Cleanup ───────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    activeRef.current = false;
    setScraping(false);
  }, []);

  // ── Main trigger ──────────────────────────────────────────────
  const trigger = useCallback(async () => {
    if (activeRef.current) return;          // prevent double-click
    activeRef.current = true;
    setScraping(true);
    setElapsedSec(0);

    // Record when we clicked so we can ignore stale finishedAt values
    const clickedAt = new Date().toISOString();

    // Elapsed-time counter
    const t0 = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - t0) / 1000));
    }, 1000);

    // Fire the scrape
    try {
      await settingsApi.triggerScrape();
    } catch (err) {
      stop();
      toast.error(`Failed to start scrape: ${err.message}`);
      return;
    }

    // Poll for completion
    pollRef.current = setInterval(async () => {
      try {
        const res    = await settingsApi.scrapeStatus();
        const status = res?.data;

        const doneThisRun =
          status &&
          !status.running &&
          status.finishedAt &&
          status.finishedAt > clickedAt;   // ISO string comparison works lexicographically

        if (doneThisRun) {
          stop();

          if (status.error) {
            toast.error(`Scrape error: ${status.error}`);
            return;
          }

          const { totalNew = 0, totalFound = 0 } = status.result || {};

          if (totalNew > 0) {
            toast.success(`${totalNew} new jobs added  ·  ${totalFound} scanned`, {
              duration: 5000,
            });
          } else {
            toast(`Scrape complete — ${totalFound} jobs scanned, none new`, {
              icon: 'ℹ️',
              duration: 4000,
            });
          }

          refreshOverview();
        }
      } catch {
        // Status check failed (server restart etc.) — keep trying
      }
    }, POLL_INTERVAL_MS);

    // Safety timeout — give up polling but scrape still runs in background
    setTimeout(() => {
      if (!activeRef.current) return;
      stop();
      toast('Scrape still running in background — check Analytics for results', {
        icon: '⏱️',
        duration: 5000,
      });
    }, SAFETY_TIMEOUT_MS);
  }, [stop, refreshOverview]);

  return { scraping, elapsedSec, trigger };
}
