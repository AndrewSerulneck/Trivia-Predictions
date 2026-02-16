import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  getUserNotifications: mocks.getUserNotifications,
  markNotificationsRead: mocks.markNotificationsRead,
}));

import { GET, POST } from "@/app/api/notifications/route";

describe("/api/notifications", () => {
  beforeEach(() => {
    mocks.getUserNotifications.mockReset();
    mocks.markNotificationsRead.mockReset();
  });

  it("GET returns user notifications payload", async () => {
    mocks.getUserNotifications.mockResolvedValue({
      unreadCount: 2,
      items: [
        {
          id: "n1",
          userId: "u1",
          message: "Earned points",
          type: "success",
          read: false,
          createdAt: "2026-02-16T10:00:00.000Z",
        },
      ],
    });

    const response = await GET(new Request("http://localhost/api/notifications?userId=u1"));
    const body = (await response.json()) as {
      ok: boolean;
      unreadCount: number;
      items: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(mocks.getUserNotifications).toHaveBeenCalledWith("u1");
    expect(body.ok).toBe(true);
    expect(body.unreadCount).toBe(2);
    expect(body.items).toHaveLength(1);
  });

  it("POST marks notifications read when userId is provided", async () => {
    mocks.markNotificationsRead.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1", notificationId: "n1" }),
      })
    );

    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(mocks.markNotificationsRead).toHaveBeenCalledWith({
      userId: "u1",
      notificationId: "n1",
    });
    expect(body.ok).toBe(true);
  });

  it("POST returns 400 when userId is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: "n1" }),
      })
    );

    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(400);
    expect(body).toEqual({ ok: false, error: "userId is required." });
    expect(mocks.markNotificationsRead).not.toHaveBeenCalled();
  });

  it("POST returns 500 when mark call throws", async () => {
    mocks.markNotificationsRead.mockRejectedValue(new Error("db failure"));

    const response = await POST(
      new Request("http://localhost/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1" }),
      })
    );

    const body = (await response.json()) as { ok: boolean; error: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "db failure" });
  });
});
