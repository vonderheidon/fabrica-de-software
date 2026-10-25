import implementerResource from '../../../../../resources/roles/implementer.v1.json?raw';
import reviewerResource from '../../../../../resources/roles/reviewer.v1.json?raw';
import type { ProfileType } from '#contracts';

export const profilePrompts: Readonly<Record<ProfileType, string>> = {
  implementer: (JSON.parse(implementerResource) as { instructions: string }).instructions,
  reviewer: (JSON.parse(reviewerResource) as { instructions: string }).instructions,
};
