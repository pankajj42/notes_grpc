import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "3m", target: 50 },
    { duration: "1m", target: 100 },
    { duration: "3m", target: 100 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

const BASE = "http://notes.local/api";

export function setup() {
  const email = `load-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@test.com`;

  const signup = http.post(
    `${BASE}/auth/signup`,
    JSON.stringify({ email, password: "Password123!", deviceName: "k6" }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(signup, { "signup 201": (r) => r.status === 201 });

  if (signup.status !== 201) {
    const body = signup.body === null || signup.body === undefined ? "<empty>" : String(signup.body);
    throw new Error(`setup signup failed: status=${signup.status}, body=${body.slice(0, 500)}`);
  }
  const token = signup.json("data.tokens.accessToken");
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("setup signup failed: missing access token in response");
  }

  return { token };
}

export default function (data) {
  const token = data?.token;
  if (typeof token !== "string" || token.length === 0) {
    return;
  }

  const create = http.post(
    `${BASE}/notes`,
    JSON.stringify({
      title: "Load note",
      contentType: "TEXT",
      content: JSON.stringify({ text: "hello k6" }),
    }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );
  check(create, { "create 201": (r) => r.status === 201 });

  const list = http.get(`${BASE}/notes?page=1&pageSize=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(list, { "list 200": (r) => r.status === 200 });

  sleep(1);
}
