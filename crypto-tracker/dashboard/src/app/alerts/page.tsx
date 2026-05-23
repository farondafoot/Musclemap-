import { prisma } from "@/lib/db";
import { RiskFlags } from "@/components/RiskFlags";
import { fmtUsd, shortAddr, timeAgo, riskBg } from "@/lib/utils";

export const revalidate = 30;

export default async function AlertsPage() {
  const alerts = await prisma.alert.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      wallet: { select: { address: true, label: true, score: true } },
    },
  });

  const sent = alerts.filter(a => a.sent).length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-t1">Alert History</h1>
        <p className="text-t3 text-sm mt-1">
          {alerts.length} total · {sent} sent to Telegram
        </p>
      </div>

      {!alerts.length ? (
        <div className="text-center py-16 text-t3">
          <p className="text-4xl mb-3">🔔</p>
          <p className="text-t2">No alerts yet</p>
          <p className="text-sm mt-1">Alerts appear here when tracked wallets make qualifying trades</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map(alert => {
            const walletLabel = alert.wallet.label ?? shortAddr(alert.wallet.address);

            return (
              <div key={alert.id} className="bg-s1 border border-b1 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Risk level */}
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${riskBg(alert.riskLevel)}`}>
                      {alert.riskLevel}
                    </span>

                    <div className="min-w-0">
                      {/* Wallet + action */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <a href={`/wallets/${alert.wallet.address}`} className="font-medium text-t1 hover:text-hi transition-colors text-sm">
                          {walletLabel}
                        </a>
                        {alert.tradeAction && (
                          <span className={`text-xs font-semibold ${alert.tradeAction === "BUY" ? "text-success" : "text-danger"}`}>
                            {alert.tradeAction}
                          </span>
                        )}
                        {alert.tokenSymbol && (
                          <span className="text-sm font-medium text-t1">${alert.tokenSymbol}</span>
                        )}
                        {alert.tradeValueUsd && (
                          <span className="text-sm text-t2">{fmtUsd(Number(alert.tradeValueUsd))}</span>
                        )}
                        {alert.walletScore != null && (
                          <span className="text-xs text-t3">Score: {alert.walletScore.toFixed(0)}</span>
                        )}
                      </div>

                      {/* Risk flags */}
                      {alert.riskFlags.length > 0 && (
                        <div className="mt-1.5">
                          <RiskFlags flags={alert.riskFlags} level={alert.riskLevel} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side */}
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-xs text-t3">{timeAgo(alert.createdAt)}</span>
                    <span className={`text-xs ${alert.sent ? "text-success" : "text-t3"}`}>
                      {alert.sent ? "✓ Sent" : "Not sent"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
