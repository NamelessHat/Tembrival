# Security

Security reports: NotHappyWolf@yandex.ru (public developer signature: NamelessHat). Do not send signing keys, pairing tokens or your music library.

The peer protocol uses HTTPS with TLS 1.2 minimum (TLS 1.3 preferred by the platforms). Each PC generates an RSA-3072 / SHA-256 self-signed certificate. Its SHA-256 SPKI fingerprint is approved through a QR shown directly by the PC, or by comparing eight groups (128 bits) on both screens before pairing. DHCP addresses and UDP discovery do not establish trust. An untrusted discovery result never receives a bearer token.

Android checks certificate validity, signature, key strength and the approved SPKI on each connection. The hostname check uses the approved device key rather than an IP assigned by DHCP. There is no global trust override or HTTP fallback. Replacing the PC identity requires explicit re-pairing. Expiration fails closed. Planned renewal must preserve the key or require a new pairing; it must never silently accept another key.

Pairing PINs expire after five minutes and are single-use with per-address attempt limits. Every device has a separate revocable 256-bit bearer token. Credentials are accepted only in Authorization headers on the LAN. Android wraps stored connection records with AES-GCM using an Android Keystore key. Electron safeStorage protects the PC private key and stored device tokens with Windows protection. No OS secret-storage availability means startup stops rather than writing new plaintext secrets.

The renderer audio endpoint is a separate HTTP listener bound to 127.0.0.1 only. Its ephemeral desktop token is never a LAN credential. The LAN HTTPS service defaults to port 47832, UDP discovery to 47833. A dedicated HTTP installer listener uses 47834 and serves only the install page and APK while its five-minute window is enabled. It never serves library APIs. Its first-install traffic is **not encrypted**. Prefer trusted HTTPS distribution for a first install; offline installation requires a trusted PC and LAN. Closing the install dialog disables new installer requests. Active file transfers may finish.

Android APK updates are checked for package name, increasing version and the current signing identity before they become installable. SHA-256 checks downloaded file integrity; it is not an independent trust anchor. Android performs the final package signature verification and asks the user to install. The existing signing key has been retained.

Existing HTTP pairings deliberately stop and require one new pairing. Update the phone by installing the new signed APK over the existing app from the PC installer page or a trusted file; do not uninstall it. Old HTTP tokens cannot authenticate over the new LAN HTTPS endpoint. Music and playlist formats are unchanged.

Limits: TLS does not repair VPN routing or isolate a compromised operating system. LAN listeners may be reachable on other interfaces if network routing/firewall permits; this is not guaranteed to be 'same Wi-Fi only'. Keep Windows firewall scope to trusted private networks; do not forward these ports to the internet. A paired device is authorized to exchange the user's library. No music-at-rest encryption is provided. Certificates expire after ten years; plan renewal before expiry.

External contributions: no accounts, telemetry or analytics are added. A support link, if configured later, opens the payment provider; Tembrival does not process card details. No server or domain has been published.

References: https://developer.android.com/privacy-and-security/security-ssl , https://developer.android.com/privacy-and-security/keystore , https://www.electronjs.org/docs/latest/api/safe-storage .
