import { getRequestConfig } from "next-intl/server";
import messages from "../messages/fr.json";

export default getRequestConfig(async () => ({
  locale: "fr-TN",
  timeZone: "Africa/Tunis",
  messages
}));
