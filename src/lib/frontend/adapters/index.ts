import { createLiveAdapters, liveClients } from "./live";
export const { authAdapter, managementAdapter, intelligenceAdapter, analyticsAdapter } = createLiveAdapters(liveClients);
