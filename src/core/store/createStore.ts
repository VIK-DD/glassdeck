// Minimal observable store: state + pure reducer + subscribers.
// Swift equivalent: an @Observable class holding `state` with a `send(_ action:)` method.

export type Listener = () => void;

export interface Store<S, A> {
  getState(): S;
  dispatch(action: A): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<S, A>(reducer: (state: S, action: A) => S, initialState: S): Store<S, A> {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    dispatch(action) {
      const next = reducer(state, action);
      if (next === state) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
