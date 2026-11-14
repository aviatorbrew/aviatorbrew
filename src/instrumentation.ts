export async function register(){
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.NODE_ENV==='production'&&process.env.NEXT_PHASE!=='phase-production-build'&&process.env.EVENT_PROPOSAL_REMINDERS_DISABLED!=='true'&&(process.env.RENDER_SERVICE_ID||process.env.RENDER==='true')){const {startEventProposalReminderWorker}=await import('@/lib/event-proposal-reminders');startEventProposalReminderWorker();}

  // Render runs a persistent Node server. A precise timer closes already-open hosted checkouts;
  // the existing protected scheduled job is a second path after a restart or provider outage.
  if(process.env.NEXT_RUNTIME==='nodejs'&&process.env.NODE_ENV==='production'&&process.env.NEXT_PHASE!=='phase-production-build'&&process.env.SHOP_TICKET_WORKER_DISABLED!=='true'&&(process.env.RENDER_SERVICE_ID||process.env.RENDER==='true')){
    const {startShopTicketCutoffWorker}=await import('@/lib/shop-ticket-cutoffs');
    startShopTicketCutoffWorker();
  }
}
