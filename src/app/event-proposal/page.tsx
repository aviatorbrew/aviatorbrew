import type { Metadata } from "next";
import { EventProposalCustomer } from "@/components/event-proposal-customer";
export const metadata:Metadata={title:'Review Your Aviator Event Proposal',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function EventProposalPage(){return <EventProposalCustomer/>;}
