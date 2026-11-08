"use client";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
export function useInterfaceMotion() {
  const reduce = useReducedMotion();
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const key = () => {
      setKeyboard(true);
      document.documentElement.dataset.input = "keyboard";
    };
    const pointer = () => {
      setKeyboard(false);
      document.documentElement.dataset.input = "pointer";
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", pointer, true);
    };
  }, []);
  return {
    instant: reduce || keyboard,
    duration: reduce || keyboard ? 0 : 0.2,
  };
}
