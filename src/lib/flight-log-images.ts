import path from "node:path";

export function flightLogImageDirectory() {
  if (process.env.FLIGHT_LOG_IMAGE_DIRECTORY) return process.env.FLIGHT_LOG_IMAGE_DIRECTORY;
  if (process.env.FLIGHT_LOG_DATA_FILE) return path.join(path.dirname(process.env.FLIGHT_LOG_DATA_FILE), "flight-log-images");
  return path.join(process.cwd(), "data", "flight-log-images");
}

export function flightLogImageUrl(filename: string) {
  return "/api/flight-log-images/" + encodeURIComponent(filename);
}
