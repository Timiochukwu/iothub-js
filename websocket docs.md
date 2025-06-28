## 1. How to Connect

There are two types of clients: **Devices** and **Watchers**.

### Connecting as a Device (Data Source)

A Device must provide its unique IMEI in the `auth` object during connection.

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:6162", {
  auth: {
    imei: "YOUR_DEVICE_IMEI_HERE",
  },
});
```

### Connecting as a Watcher (Data Consumer)

A Watcher connects without any authentication.

```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:6162");
```

---

## 2. Watcher Client API

A Watcher client consumes data by emitting requests and listening for responses.

### Events to Send (`socket.emit`)

| Event Name                | Description                                           | Payload to Pass (Object)    |
| ------------------------- | ----------------------------------------------------- | --------------------------- |
| `subscribe_to_device`     | Subscribe to receive live data pushes from a device.  | `{ "imei": "DEVICE_IMEI" }` |
| `get_real_time_telemetry` | Request the latest known data for a device just once. | `{ "imei": "DEVICE_IMEI" }` |

### Events to Receive (`socket.on`)

| Event Name            | Description                                                              | Payload Received (Object)                                   |
| --------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `device_subscribed`   | Confirmation from the server that your subscription was successful.      | `{ "success": true, "imei": "DEVICE_IMEI" }`                |
| `real_time_telemetry` | **Polled** data sent in response to a `get_real_time_telemetry` request. | `{ "imei": "...", "latitude": ..., "longitude": ..., ... }` |

---

## 3. Device Client API

A Device client primarily listens for connection status events after authenticating.

### Events to Receive (`socket.on`)

| Event Name          | Description                                                            | Payload Received (Object)                                  |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `device_registered` | Confirmation from the server that the device connection is registered. | `{ "success": true, "message": "Device ... registered." }` |

---

## 4. General Events (For All Clients)

### Events to Receive (`socket.on`)

| Event Name   | Description                               | Payload Received       |
| ------------ | ----------------------------------------- | ---------------------- |
| `connect`    | Fired upon a successful connection.       | -                      |
| `disconnect` | Fired upon disconnection from the server. | `(reason)` (String)    |
| `error`      | Fired when the server reports an error.   | `{ "message": "..." }` |
