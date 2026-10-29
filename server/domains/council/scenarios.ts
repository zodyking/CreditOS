import type { RemedyChannel } from '#shared/constants'
import type { ResponseScenario } from '../../db/schema'

/**
 * Branching response forecast. Every branch is explicitly illustrative; no
 * probabilities are assigned because no provider supplies them.
 */
export function buildScenarios(channel: RemedyChannel, contestedField: string | null, reviewWindow: string): ResponseScenario[] {
  const field = contestedField ?? 'the contested item'
  const common: ResponseScenario[] = [
    {
      key: 'corrected',
      title: 'Item corrected / updated',
      whyPlausible: `Reinvestigations frequently end with the furnisher updating ${field} to its current record; the bureau reports "updated".`,
      evidenceThatMatters: ['Bureau result letter', 'Next report snapshot showing the new value'],
      recommendedNextStep: 'Verify the correction on the next snapshot at every bureau before closing; open follow-up if the correction did not propagate.',
      statusImpact: 'RESOLVED',
      requiresApproval: false,
      illustrativeOnly: true,
    },
    {
      key: 'deleted',
      title: 'Item deleted',
      whyPlausible: 'If the furnisher cannot verify within the window, the bureau must delete or suppress the item.',
      evidenceThatMatters: ['Bureau result letter stating deletion', 'Snapshot confirming absence'],
      recommendedNextStep: 'Confirm deletion on subsequent snapshots; watch for reinsertion, which requires bureau notice.',
      statusImpact: 'RESOLVED',
      requiresApproval: false,
      illustrativeOnly: true,
    },
    {
      key: 'verified_no_change',
      title: 'Verified as reported — no change',
      whyPlausible: 'Furnishers often re-confirm their existing record through automated verification without reviewing enclosures.',
      evidenceThatMatters: ['Result letter wording', 'Whether enclosures were acknowledged'],
      recommendedNextStep: 'Council re-runs with the response; options include requesting the method of verification, a direct furnisher dispute, or adding a consumer statement. Each needs approval.',
      statusImpact: 'FOLLOW_UP_RECOMMENDED',
      requiresApproval: true,
      illustrativeOnly: true,
    },
    {
      key: 'partially_updated',
      title: 'Partially updated',
      whyPlausible: `One field may be corrected while ${field} or another field remains inconsistent.`,
      evidenceThatMatters: ['Result letter detail', 'Field-by-field comparison on the next snapshot'],
      recommendedNextStep: 'Narrow the case to the remaining field and consider a targeted follow-up.',
      statusImpact: 'FOLLOW_UP_RECOMMENDED',
      requiresApproval: true,
      illustrativeOnly: true,
    },
    {
      key: 'more_information_requested',
      title: 'Bureau requests identification or more information',
      whyPlausible: 'Bureaus commonly ask for proof of identity or address before processing a mailed dispute.',
      evidenceThatMatters: ['The exact documents requested'],
      recommendedNextStep: 'Provide the requested identification (approval required for sensitive disclosure); the review window restarts on receipt.',
      statusImpact: 'FOLLOW_UP_RECOMMENDED',
      requiresApproval: true,
      illustrativeOnly: true,
    },
    {
      key: 'undeliverable',
      title: 'Letter undeliverable / returned',
      whyPlausible: 'Address formatting or a changed PO box can cause returns.',
      evidenceThatMatters: ['Return reason from the mail provider or envelope'],
      recommendedNextStep: 'Validate the recipient address and re-queue the mailing (approval required).',
      statusImpact: 'UNDELIVERABLE',
      requiresApproval: true,
      illustrativeOnly: true,
    },
    {
      key: 'no_response',
      title: 'No response by the review point',
      whyPlausible: `Mail delays or processing backlogs can push a response past ${reviewWindow || 'the expected window'}.`,
      evidenceThatMatters: ['Delivery confirmation date (if the provider supplies one)', 'Any online dispute status'],
      recommendedNextStep: 'Mark status unknown, check the bureau portal, and consider a follow-up letter referencing the original date.',
      statusImpact: 'DISPUTED_STATUS_UNKNOWN',
      requiresApproval: true,
      illustrativeOnly: true,
    },
  ]
  if (channel === 'debt_validation_request' || channel === 'furnisher_direct_dispute' || channel === 'goodwill_request') {
    common.push({
      key: 'rerouted_other_channel',
      title: 'Recipient redirects to another channel',
      whyPlausible: 'Furnishers and collectors often redirect disputes to a specific department or to the bureaus.',
      evidenceThatMatters: ['Redirect instructions in the response'],
      recommendedNextStep: 'Council evaluates the redirected channel; a new letter would require approval.',
      statusImpact: 'FOLLOW_UP_RECOMMENDED',
      requiresApproval: true,
      illustrativeOnly: true,
    })
  }
  return common
}
