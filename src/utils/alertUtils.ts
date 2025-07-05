export const sendAlert = async ({ imei, title, message }: { imei: string; title: string; message: string }) => {
    console.log("Sending alert:", { imei, title, message });
    // Plug in real alerting service here
  };
  