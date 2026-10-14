"use client";

import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import { hapticForAnimation, playHaptic } from "@/lib/nativeHaptics";
import type { AnimationPayload, AnimationType } from "@/types/animation";

type QueuedAnimation = {
  id: number;
  type: AnimationType;
  payload?: AnimationPayload;
};

type AnimationTriggerState = {
  queue: QueuedAnimation[];
  active: QueuedAnimation | null;
};

type AnimationTriggerContextValue = {
  active: QueuedAnimation | null;
  /** Queues an animation and returns its id (for `updateAnimationPayload`). */
  triggerAnimation: (type: AnimationType, payload?: AnimationPayload) => number;
  /** Merges late-arriving data (e.g. the server's points) into a queued or playing animation.
   *  A no-op once that animation has finished. */
  updateAnimationPayload: (id: number, patch: AnimationPayload) => void;
  completeAnimation: (id: number) => void;
  /** Removes an animation now, whether it is playing or still queued (e.g. the player moved on). */
  dismissAnimation: (id: number) => void;
};

type AnimationAction =
  | { type: "TRIGGER"; payload: QueuedAnimation }
  | { type: "COMPLETE"; payload: { id: number } }
  | { type: "DISMISS"; payload: { id: number } }
  | { type: "UPDATE_PAYLOAD"; payload: { id: number; patch: AnimationPayload } };

function patchAnimation(item: QueuedAnimation, id: number, patch: AnimationPayload): QueuedAnimation {
  return item.id === id ? { ...item, payload: { ...item.payload, ...patch } } : item;
}

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

  if (action.type === "DISMISS") {
    if (state.active?.id === action.payload.id) {
      const [next, ...rest] = state.queue;
      return { queue: rest, active: next ?? null };
    }
    if (!state.queue.some((item) => item.id === action.payload.id)) {
      return state;
    }
    return { ...state, queue: state.queue.filter((item) => item.id !== action.payload.id) };
  }

  if (action.type === "UPDATE_PAYLOAD") {
    const { id, patch } = action.payload;
    if (state.active?.id !== id && !state.queue.some((item) => item.id === id)) {
      return state;
    }
    return {
      queue: state.queue.map((item) => patchAnimation(item, id, patch)),
      active: state.active ? patchAnimation(state.active, id, patch) : null,
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

  const triggerAnimation = useCallback((type: AnimationType, payload?: AnimationPayload): number => {
    const haptic = hapticForAnimation(type);
    if (haptic) playHaptic(haptic);
    const id = nextAnimationId();
    dispatch({
      type: "TRIGGER",
      payload: { id, type, payload },
    });
    return id;
  }, []);

  const updateAnimationPayload = useCallback((id: number, patch: AnimationPayload) => {
    dispatch({ type: "UPDATE_PAYLOAD", payload: { id, patch } });
  }, []);

  const completeAnimation = useCallback((id: number) => {
    dispatch({ type: "COMPLETE", payload: { id } });
  }, []);

  const dismissAnimation = useCallback((id: number) => {
    dispatch({ type: "DISMISS", payload: { id } });
  }, []);

  const value = useMemo<AnimationTriggerContextValue>(
    () => ({
      active: state.active,
      triggerAnimation,
      updateAnimationPayload,
      completeAnimation,
      dismissAnimation,
    }),
    [completeAnimation, dismissAnimation, state.active, triggerAnimation, updateAnimationPayload]
  );

  return (
    <AnimationTriggerContext.Provider value={value}>{children}</AnimationTriggerContext.Provider>
  );
}

export function useAnimationTrigger(): Pick<
  AnimationTriggerContextValue,
  "triggerAnimation" | "updateAnimationPayload" | "dismissAnimation"
> {
  const context = useContext(AnimationTriggerContext);
  if (!context) {
    throw new Error("useAnimationTrigger must be used within AnimationTriggerProvider");
  }
  return {
    triggerAnimation: context.triggerAnimation,
    updateAnimationPayload: context.updateAnimationPayload,
    dismissAnimation: context.dismissAnimation,
  };
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
