"use client";

import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { AnimationType } from "@/types/animation";

type QueuedAnimation = {
  id: number;
  type: AnimationType;
};

type AnimationTriggerState = {
  queue: QueuedAnimation[];
  active: QueuedAnimation | null;
};

type AnimationTriggerContextValue = {
  active: QueuedAnimation | null;
  triggerAnimation: (type: AnimationType) => void;
  completeAnimation: (id: number) => void;
};

type AnimationAction =
  | { type: "TRIGGER"; payload: QueuedAnimation }
  | { type: "COMPLETE"; payload: { id: number } };

const INITIAL_STATE: AnimationTriggerState = {
  queue: [],
  active: null,
};

const AnimationTriggerContext = createContext<AnimationTriggerContextValue | null>(null);

function animationReducer(state: AnimationTriggerState, action: AnimationAction): AnimationTriggerState {
  if (action.type === "TRIGGER") {
    if (state.active === null) {
      return { ...state, active: action.payload };
    }
    return { ...state, queue: [...state.queue, action.payload] };
  }

  if (action.type === "COMPLETE") {
    if (state.active?.id !== action.payload.id) {
      return state;
    }
    const [next, ...rest] = state.queue;
    return {
      queue: rest,
      active: next ?? null,
    };
  }

  return state;
}

let animationIdCounter = 0;

function nextAnimationId(): number {
  animationIdCounter += 1;
  return animationIdCounter;
}

export function AnimationTriggerProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(animationReducer, INITIAL_STATE);

  const triggerAnimation = useCallback((type: AnimationType) => {
    dispatch({
      type: "TRIGGER",
      payload: { id: nextAnimationId(), type },
    });
  }, []);

  const completeAnimation = useCallback((id: number) => {
    dispatch({ type: "COMPLETE", payload: { id } });
  }, []);

  const value = useMemo<AnimationTriggerContextValue>(
    () => ({
      active: state.active,
      triggerAnimation,
      completeAnimation,
    }),
    [completeAnimation, state.active, triggerAnimation]
  );

  return (
    <AnimationTriggerContext.Provider value={value}>{children}</AnimationTriggerContext.Provider>
  );
}

export function useAnimationTrigger(): Pick<AnimationTriggerContextValue, "triggerAnimation"> {
  const context = useContext(AnimationTriggerContext);
  if (!context) {
    throw new Error("useAnimationTrigger must be used within AnimationTriggerProvider");
  }
  return { triggerAnimation: context.triggerAnimation };
}

export function useAnimationOverlayState(): Pick<
  AnimationTriggerContextValue,
  "active" | "completeAnimation"
> {
  const context = useContext(AnimationTriggerContext);
  if (!context) {
    throw new Error("useAnimationOverlayState must be used within AnimationTriggerProvider");
  }
  return {
    active: context.active,
    completeAnimation: context.completeAnimation,
  };
}
