import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../../../../lib/db", () => ({
  default: { query: mockQuery },
}));

import { GET } from "../route";

describe("GET /api/areas", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns { areas } with all rows from the database", async () => {
    const fakeRows = [
      { slug: "gachibowli", name: "Gachibowli", centre_lat: 17.4401, centre_lng: 78.3489 },
      { slug: "madhapur", name: "Madhapur", centre_lat: 17.4484, centre_lng: 78.3908 },
    ];
    mockQuery.mockResolvedValueOnce({ rows: fakeRows });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ areas: fakeRows });
  });

  it("returns an empty array when there are no areas", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ areas: [] });
  });

  it("selects only slug, name, centre_lat, centre_lng ordered by name", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await GET();

    expect(mockQuery).toHaveBeenCalledOnce();
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain("slug");
    expect(sql).toContain("name");
    expect(sql).toContain("centre_lat");
    expect(sql).toContain("centre_lng");
    expect(sql).toContain("ORDER BY name");
  });

  it("matches the Area schema shape (slug, name, centre_lat, centre_lng)", async () => {
    const fakeRow = {
      slug: "hitec-city",
      name: "HITEC City",
      centre_lat: 17.4474,
      centre_lng: 78.3762,
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] });

    const response = await GET();
    const body = await response.json();
    const area = body.areas[0];

    expect(area).toHaveProperty("slug");
    expect(area).toHaveProperty("name");
    expect(area).toHaveProperty("centre_lat");
    expect(area).toHaveProperty("centre_lng");
    expect(typeof area.slug).toBe("string");
    expect(typeof area.name).toBe("string");
    expect(typeof area.centre_lat).toBe("number");
    expect(typeof area.centre_lng).toBe("number");
  });
});
