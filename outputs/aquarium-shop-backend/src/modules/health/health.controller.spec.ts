import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  it("returns an ok status and a timestamp", () => {
    const controller = new HealthController({} as never);
    const result = controller.check();

    expect(result.status).toBe("ok");
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
