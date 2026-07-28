import { promises as fs } from "node:fs";
import path from "node:path";

export type FlightCrewWelcome = {
  subject: string;
  heading: string;
  intro: string;
  history: string;
  speakeasy: string;
  special: string;
};

export const defaultFlightCrewWelcome: FlightCrewWelcome = {
  subject: "Welcome aboard the Aviator Flight Crew",
  heading: "You are cleared for takeoff.",
  intro: "Welcome to the Flight Crew. You will be first in line for fresh beer releases, concerts, events, restaurant news, and offers from across Aviator.",
  history: "Aviator started in November 2008 in an airplane hangar with one employee and two repurposed 300-gallon dairy tanks. Distribution began in January 2009. Today, the Aviator brewery campus is powered by a 60-barrel, four-vessel brewhouse and carries that original hands-on spirit into every pour.",
  speakeasy: "The Aviator Speakeasy Liquor Lounge is our intimate campus hideaway for considered cocktails, whiskey, and a little after-hours mystery.",
  special: "Thursday is Buffalo Trace night: enjoy a Buffalo Trace Old Fashioned for $10 at the Speakeasy Liquor Lounge.",
};

const file = () => process.env.FLIGHT_CREW_WELCOME_DATA_FILE || path.join(process.cwd(), "data", "flight-crew-welcome.json");

export async function getFlightCrewWelcome(): Promise<FlightCrewWelcome> {
  try {
    const value = JSON.parse(await fs.readFile(file(), "utf8")) as Partial<FlightCrewWelcome>;
    return {
      subject: typeof value.subject === "string" ? value.subject : defaultFlightCrewWelcome.subject,
      heading: typeof value.heading === "string" ? value.heading : defaultFlightCrewWelcome.heading,
      intro: typeof value.intro === "string" ? value.intro : defaultFlightCrewWelcome.intro,
      history: typeof value.history === "string" ? value.history : defaultFlightCrewWelcome.history,
      speakeasy: typeof value.speakeasy === "string" ? value.speakeasy : defaultFlightCrewWelcome.speakeasy,
      special: typeof value.special === "string" ? value.special : defaultFlightCrewWelcome.special,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaultFlightCrewWelcome;
    throw error;
  }
}

export async function saveFlightCrewWelcome(value: FlightCrewWelcome) {
  const destination = file();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temporary, destination);
  return value;
}
