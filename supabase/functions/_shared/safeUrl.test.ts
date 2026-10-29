import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkUrlSyntax, isPrivateIPv4, isPrivateIPv6 } from "./safeUrl.ts";

Deno.test("blocks private and metadata IPv4", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0"]) {
    assertEquals(isPrivateIPv4(ip), true, ip);
  }
  assertEquals(isPrivateIPv4("8.8.8.8"), false);
});

Deno.test("blocks private IPv6", () => {
  for (const ip of ["::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assertEquals(isPrivateIPv6(ip), true, ip);
  assertEquals(isPrivateIPv6("2606:4700::1111"), false);
});

Deno.test("url syntax rules", () => {
  assertEquals(checkUrlSyntax("http://example.com").ok, false);
  assertEquals(checkUrlSyntax("https://localhost/x").ok, false);
  assertEquals(checkUrlSyntax("https://169.254.169.254/latest").ok, false);
  assertEquals(checkUrlSyntax("https://example.com:8443/").ok, false);
  assertEquals(checkUrlSyntax("https://user:pw@example.com/").ok, false);
  assertEquals(checkUrlSyntax("https://hooks.zapier.com/hooks/catch/1/abc").ok, true);
});
