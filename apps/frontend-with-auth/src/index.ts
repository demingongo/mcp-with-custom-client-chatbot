import express from "express";
import { AddressInfo } from "net";

const app = express();

app.use(express.static("public"));

const server = app.listen(8080, "127.0.0.1", () => {
  const addressInfo = server.address() as AddressInfo;
  console.log(`Server running at http://${addressInfo.address}:${addressInfo.port}`);
});
