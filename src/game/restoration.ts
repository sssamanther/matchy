export interface RestorationTask {
  id: string;
  name: string;
  description: string;
  cost: number;
  requires?: string[];
}

export const RESTORATION_TASKS: RestorationTask[] = [
  { id: 'branches', name: 'Clear fallen branches', description: 'Remove debris from the storm.', cost: 3 },
  { id: 'fence', name: 'Repair the garden fence', description: 'Fix the broken fence panels.', cost: 5, requires: ['branches'] },
  { id: 'flowerbeds', name: 'Restore the flower beds', description: 'Replant the damaged beds.', cost: 8, requires: ['branches'] },
  { id: 'greenhouse', name: 'Rebuild the greenhouse', description: 'Restore the glasshouse.', cost: 12, requires: ['fence', 'flowerbeds'] },
];

export function isTaskAvailable(task: RestorationTask, completed: string[]): boolean {
  if (completed.includes(task.id)) return false;
  if (!task.requires) return true;
  return task.requires.every((r) => completed.includes(r));
}