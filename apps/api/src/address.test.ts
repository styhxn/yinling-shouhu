import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { createAddressService, wgs84ToGcj02 } from "./services/location/address.js";
import { testConfig } from "./testUtils.js";

describe("address reverse geocoding", () => {
  it("converts WGS84 coordinates to GCJ-02 inside China", () => {
    const beijing = wgs84ToGcj02(39.9087, 116.3975);
    expect(beijing.lat).toBeCloseTo(39.9101, 3);
    expect(beijing.lng).toBeCloseTo(116.4037, 3);

    const nanjing = wgs84ToGcj02(32.044, 118.783);
    expect(nanjing.lat).toBeCloseTo(32.0419, 3);
    expect(nanjing.lng).toBeCloseTo(118.7882, 3);
  });

  it("leaves coordinates outside China unchanged", () => {
    expect(wgs84ToGcj02(48.8566, 2.3522)).toEqual({ lat: 48.8566, lng: 2.3522 });
  });

  it("requests AMap with converted coordinates and caches by street-level precision", async () => {
    let calls = 0;
    let requested = "";
    const config = loadConfig(testConfig({ amapWebKey: "test-key" }));
    const service = createAddressService({
      config,
      fetcher: async (url) => {
        calls += 1;
        requested = url;
        return {
          status: "1",
          regeocode: {
            formatted_address: "江苏省南京市鼓楼区湖南路街道",
            addressComponent: {
              province: "江苏省",
              city: "南京市",
              district: "鼓楼区",
              township: "湖南路街道"
            }
          }
        };
      }
    });

    const first = await service.reverse({ lat: 32.044, lng: 118.783 });
    expect(first?.address).toBe("江苏省南京市鼓楼区湖南路街道");
    expect(first?.source).toBe("amap");
    expect(requested).toContain("location=");
    expect(decodeURIComponent(requested)).not.toContain("118.783000,32.044000");

    const cached = await service.reverse({ lat: 32.0441, lng: 118.7831 });
    expect(cached?.address).toBe("江苏省南京市鼓楼区湖南路街道");
    expect(cached?.source).toBe("cache");
    expect(calls).toBe(1);
  });

  it("composes an address when AMap omits formatted_address", async () => {
    const config = loadConfig(testConfig({ amapWebKey: "test-key" }));
    const service = createAddressService({
      config,
      fetcher: async () => ({
        status: "1",
        regeocode: {
          formatted_address: [],
          addressComponent: {
            province: "上海市",
            city: [],
            district: "黄浦区",
            township: "南京东路街道",
            streetNumber: { street: "南京东路" }
          }
        }
      })
    });
    const result = await service.reverse({ lat: 31.2304, lng: 121.4737 });
    expect(result?.address).toBe("上海市黄浦区南京东路街道南京东路");
  });

  it("returns null without a configured key and never calls the network", async () => {
    const config = loadConfig(testConfig());
    const service = createAddressService({
      config,
      fetcher: async () => {
        throw new Error("network should not be called");
      }
    });
    expect(await service.reverse({ lat: 32.044, lng: 118.783 })).toBeNull();
  });
});
