import { ProposalWorkspace } from "../ProposalWorkspace";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalWorkspace proposalId={id} />;
}
