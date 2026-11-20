import { describe, expect, it } from "vitest";
import { toQuestionMedia } from "@/lib/questionMedia";

describe("toQuestionMedia", () => {
  it("returns null for empty or unsafe URLs", () => {
    expect(toQuestionMedia(null)).toBeNull();
    expect(toQuestionMedia("   ")).toBeNull();
    expect(toQuestionMedia("javascript:alert(1)")).toBeNull();
    expect(toQuestionMedia("data:image/png;base64,AAAA")).toBeNull();
    expect(toQuestionMedia("//evil.example.com/x.png")).toBeNull();
    expect(toQuestionMedia("not a url")).toBeNull();
  });

  it("treats a local map as a contained image with the map credit", () => {
    expect(toQuestionMedia("/maps/geography-map-texas.png")).toEqual({
      kind: "image",
      url: "/maps/geography-map-texas.png",
      credit: "Map: Natural Earth / U.S. Census",
      fit: "contain",
    });
  });

  it("credits Wikimedia and contains it; photos elsewhere cover with no credit", () => {
    const wiki = toQuestionMedia("https://upload.wikimedia.org/wikipedia/commons/a/ab/Eiffel.jpg");
    expect(wiki?.credit).toBe("Wikimedia Commons");
    expect(wiki?.fit).toBe("contain");
    const photo = toQuestionMedia("https://images.unsplash.com/photo-1?w=800&fit=crop");
    expect(photo).toMatchObject({ kind: "image", credit: null, fit: "cover" });
  });

  it("an explicit credit wins", () => {
    expect(toQuestionMedia("/maps/x.svg", "Someone")?.credit).toBe("Someone");
  });

  it("a GIF is an image; mp4/webm/mov are video, even with a query string", () => {
    expect(toQuestionMedia("https://cdn.example.com/clip.gif")?.kind).toBe("image");
    expect(toQuestionMedia("https://cdn.example.com/clip.mp4?v=2")?.kind).toBe("video");
    expect(toQuestionMedia("/media/clip.webm")?.kind).toBe("video");
    expect(toQuestionMedia("https://cdn.example.com/CLIP.MOV")?.kind).toBe("video");
  });
});
