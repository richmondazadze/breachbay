import type { Asset, GraphEdge, ResponsePlan } from "@/lib/contracts";
import { ResponseTargets } from "./decision-details";

export function ResponsePlanning({ plan, assets, edges = [], incidentId, version }: { plan?: ResponsePlan; assets: Asset[]; edges?: GraphEdge[]; incidentId?: string; version?: number }) {
  if (!plan) return null;
  const name = (id: string) => assets.find(asset => asset.id === id)?.name ?? id;
  return (
    <details className="response-planning">
      <summary>Recorded response alternatives{version !== undefined ? ` · scenario v${version}` : ""}</summary>
      <p className="small">These are recorded synthetic previews. Compare service disruption and unresolved exposure before requesting a proposal. They do not authorize execution.</p>
      {plan.assumptions.map((assumption,index)=><p key={index}>Assumption: {assumption}</p>)}
      {plan.uncertainty.map((uncertainty,index)=><p key={index}>Unresolved: {uncertainty}</p>)}
      {plan.alternatives.map((alternative,index)=><article key={index} className="decision-body">
        <h3>{alternative.action.type.replaceAll("_"," ")}</h3>
        <ResponseTargets action={alternative.action} incidentId={incidentId ?? assets[0]?.incidentId ?? ""} assets={assets} edges={edges} />
        <p>{alternative.rationale}</p>
        {alternative.tradeoffs.map((tradeoff,index)=><p key={index}>Tradeoff: {tradeoff}</p>)}
        {alternative.expectedImpact && <dl className="mission-projections">
          <div><dt>Previewed containment coverage</dt><dd>{Math.round(alternative.expectedImpact.containmentCoverage*100)}%</dd></div>
          <div><dt>Disrupted services</dt><dd>{alternative.expectedImpact.disruptedServiceIds.map(name).join(", ") || "None in this model"}</dd></div>
          <div><dt>Unresolved protected assets</dt><dd>{alternative.expectedImpact.unresolvedProtectedAssetIds.map(name).join(", ") || "None in this model"}</dd></div>
        </dl>}
      </article>)}
    </details>
  );
}
