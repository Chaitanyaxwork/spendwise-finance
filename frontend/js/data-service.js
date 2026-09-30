import { API_BASE_URL, api } from "./api.js";
import { demoApi } from "./mock-data.js";

// Mode is chosen once from the explicit API base URL. A live API error is never
// converted into sample data; the caller receives the error and can offer retry.
export const DEMO_MODE = !API_BASE_URL;
export const dataService = DEMO_MODE ? demoApi : api;
