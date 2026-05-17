import express from "express";
import { AddressInfo } from "net";

const PORT = process.env.PORT && !isNaN(parseInt(process.env.PORT)) ? parseInt(process.env.PORT) : 8080;
const SERVER_BIND_ADDRESS = process.env.SERVER_BIND_ADDRESS || "127.0.0.1";

const app = express();

app.use(express.static("public"));

const server = app.listen(PORT, SERVER_BIND_ADDRESS, () => {
  const addressInfo = server.address() as AddressInfo;
  console.log(`Server running at http://${addressInfo.address}:${addressInfo.port}`);
});
