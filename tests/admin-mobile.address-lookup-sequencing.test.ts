// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAddressLookup, type AddressPrediction } from "@/components/admin/useAddressLookup";

// admin-mobile Phase R1, finding 5. Two overlapping /api/geolocation/predict
// flights can resolve out of order (fast network beats slow one that started
// first); without request-id sequencing, the older response overwrites the
// newer one and the salesperson sees a stale prediction list. This pins that
// the request that started LAST always wins, regardless of resolve order.

const prediction = (suffix: string): AddressPrediction => ({
  placeId: `place-${suffix}`,
  mainText: `${suffix} Main St`,
  secondaryText: "Denver, CO",
  fullText: `${suffix} Main St, Denver, CO`,
});

describe("useAddressLookup request sequencing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("discards a stale loadPredictions response that resolves after a newer one", async () => {
    let resolveFirst!: (value: Response) => void;
    let resolveSecond!: (value: Response) => void;
    const firstFlight = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondFlight = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstFlight)
      .mockImplementationOnce(() => secondFlight);
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    const { result } = renderHook(() => useAddressLookup());

    // First keystroke fires the first flight (older, "stale" query).
    act(() => {
      result.current.handleInput("120 Main");
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    // Second keystroke fires the second flight (newer query) before the
    // first has resolved.
    act(() => {
      result.current.handleInput("1200 Main");
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Resolve out of order: the newer (second) flight lands first, then the
    // stale (first) flight lands after it.
    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => ({ ok: true, predictions: [prediction("1200")] }),
      } as Response);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.predictions).toHaveLength(1);
      expect(result.current.predictions[0]?.placeId).toBe("place-1200");
    });

    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => ({ ok: true, predictions: [prediction("120")] }),
      } as Response);
      await Promise.resolve();
    });

    // The stale response must not overwrite the newer result, and must not
    // leave `loading` stuck true (the finally-block race the phase doc
    // named explicitly).
    expect(result.current.predictions).toHaveLength(1);
    expect(result.current.predictions[0]?.placeId).toBe("place-1200");
    expect(result.current.loading).toBe(false);
  });

  it("discards a stale select() resolution so an old tap can't overwrite a newer one", async () => {
    let resolveFirst!: (value: Response) => void;
    let resolveSecond!: (value: Response) => void;
    const firstFlight = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondFlight = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstFlight)
      .mockImplementationOnce(() => secondFlight);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAddressLookup());

    let firstSelectPromise!: Promise<unknown>;
    let secondSelectPromise!: Promise<unknown>;
    act(() => {
      firstSelectPromise = result.current.select(prediction("120"));
    });
    act(() => {
      secondSelectPromise = result.current.select(prediction("1200"));
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => ({
          ok: true,
          details: {
            street: "1200 Main St",
            city: "Denver",
            state: "CO",
            zipCode: "80202",
            country: "United States",
            latitude: 39.7392,
            longitude: -104.9903,
            placeId: "place-1200",
          },
        }),
      } as Response);
      await secondSelectPromise;
    });

    expect(result.current.query).toContain("1200 Main St");

    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => ({
          ok: true,
          details: {
            street: "120 Main St",
            city: "Denver",
            state: "CO",
            zipCode: "80202",
            country: "United States",
            latitude: 39.7392,
            longitude: -104.9903,
            placeId: "place-120",
          },
        }),
      } as Response);
      await firstSelectPromise;
    });

    // The older select() must not clobber the query the newer one set, and
    // loading must not be stuck true.
    expect(result.current.query).toContain("1200 Main St");
    expect(result.current.loading).toBe(false);
  });

  it("does not let a pending debounced predict reopen the dropdown after select() commits", async () => {
    const detailsFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        details: {
          street: "1200 Main St",
          city: "Denver",
          state: "CO",
          zipCode: "80202",
          country: "United States",
          latitude: 39.7392,
          longitude: -104.9903,
          placeId: "place-1200",
        },
      }),
    } as Response);
    // Predict must never resolve for this test — if the stale timer fires
    // and this rejects, the assertion below (predictions untouched) proves
    // it, since a rejected loadPredictions clears predictions/open too.
    const predictFetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      return url.includes("/details") ? detailsFetch() : predictFetch();
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.useFakeTimers();
    const { result } = renderHook(() => useAddressLookup());

    // Keystroke schedules a 300ms debounced predict.
    act(() => {
      result.current.handleInput("1200 Main");
    });

    // User taps a prediction (e.g. from a still-open earlier list) before
    // the debounce elapses. select() must cancel the pending timer.
    let selectPromise!: Promise<unknown>;
    act(() => {
      selectPromise = result.current.select(prediction("1200"));
    });
    await act(async () => {
      await selectPromise;
    });

    expect(result.current.query).toContain("1200 Main St");
    expect(result.current.open).toBe(false);

    // Advance past the debounce window. If select() hadn't cleared the
    // timer, loadPredictions would fire here and reopen the dropdown over
    // the just-committed address.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();

    expect(predictFetch).not.toHaveBeenCalled();
    expect(result.current.open).toBe(false);
    expect(result.current.query).toContain("1200 Main St");
  });
});
