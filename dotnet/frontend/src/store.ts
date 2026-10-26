import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { newTask } from './task';
import { DEFAULT_ENVIRONMENT } from './environments';
import type { EnvironmentId, TaskResource } from './types';

interface EditorState { task: TaskResource; environmentId: EnvironmentId }
const editor = createSlice({
  name: 'editor',
  initialState: (): EditorState => ({ task: newTask(), environmentId: DEFAULT_ENVIRONMENT }),
  reducers: {
    replaceTask: (state, action: PayloadAction<TaskResource>) => { state.task = action.payload; },
    selectEnvironment: (state, action: PayloadAction<EnvironmentId>) => { state.environmentId = action.payload; },
  },
});
export const { replaceTask, selectEnvironment } = editor.actions;
export const createStore = () => configureStore({ reducer: { editor: editor.reducer }, devTools: false });
export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
