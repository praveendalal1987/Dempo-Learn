import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Unit tests for the MSG91 email client. No database or network — fetch is
// mocked — so these run fast and in isolation.

const BASE_ENV = { ...process.env };

function configureEmailEnv() {
  process.env.MSG91_EMAIL_ENABLED = "true";
  process.env.MSG91_AUTH_KEY = "test-authkey";
  process.env.MSG91_EMAIL_FROM = "no-reply@dempo.test";
  process.env.MSG91_EMAIL_DOMAIN = "dempo.test";
  process.env.MSG91_EMAIL_TEMPLATE_ID = "tmpl_123";
}

describe("MSG91 email client", () => {
  beforeEach(() => {
    process.env = { ...BASE_ENV };
  });
  afterEach(() => {
    process.env = { ...BASE_ENV };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("posts to MSG91 with the authkey header and template payload", async () => {
    configureEmailEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const { sendTemplateEmails } = await import("./email");
    await sendTemplateEmails([
      { email: "student@dempo.test", name: "Maya", variables: { title: "Grade posted" } },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v5/email/send");
    expect(opts.method).toBe("POST");
    expect(opts.headers.authkey).toBe("test-authkey");
    const body = JSON.parse(opts.body);
    expect(body.template_id).toBe("tmpl_123");
    expect(body.domain).toBe("dempo.test");
    expect(body.from.email).toBe("no-reply@dempo.test");
    expect(body.recipients[0].to[0].email).toBe("student@dempo.test");
    expect(body.recipients[0].variables.title).toBe("Grade posted");
  });

  it("is a no-op when email is disabled", async () => {
    configureEmailEnv();
    process.env.MSG91_EMAIL_ENABLED = "false";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { sendTemplateEmails } = await import("./email");
    await sendTemplateEmails([{ email: "a@b.com" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a no-op when config is incomplete", async () => {
    process.env.MSG91_EMAIL_ENABLED = "true";
    process.env.MSG91_AUTH_KEY = "test-authkey";
    // deliberately missing FROM / DOMAIN / TEMPLATE_ID
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { sendTemplateEmails } = await import("./email");
    await sendTemplateEmails([{ email: "a@b.com" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips recipients without a valid email", async () => {
    configureEmailEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    const { sendTemplateEmails } = await import("./email");
    await sendTemplateEmails([{ email: "" }, { email: "not-an-email" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
