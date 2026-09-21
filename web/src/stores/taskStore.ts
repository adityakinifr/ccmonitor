import { create } from 'zustand';
import type { TaskItem } from '@/types';

interface TaskStore {
  tasks: TaskItem[];
  setTasks: (tasks: TaskItem[]) => void;
  addTask: (task: TaskItem) => void;
  updateTask: (task: TaskItem) => void;
  deleteTask: (taskId: string) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => {
      // Avoid duplicates
      if (state.tasks.some((t) => t.id === task.id)) {
        return state;
      }
      return { tasks: [...state.tasks, task] };
    }),

  updateTask: (task) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    })),

  deleteTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    })),
}));
