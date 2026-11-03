import { useEffect } from "react";

/**
 * Fired after any module setting is saved, so open pages reload their dropdown lists at once
 * (user 2026-11-03: a category added from 設定 must appear in the customer form without a reload).
 */
export const SETTINGS_SAVED_EVENT = "cyweb:settings-saved";
export function useSettingsSaved(reload: () => void) {
  useEffect(() => {
    window.addEventListener(SETTINGS_SAVED_EVENT, reload);
    return () => window.removeEventListener(SETTINGS_SAVED_EVENT, reload);
  }, [reload]);
}
