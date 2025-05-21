// fixtures/errorLogManagerMock.ts
export const errorLogManagerMock = {
	shouldLogError: () => ({ logLevel: 'error' }),
	setOffline: () => {},
	resetErrorState: () => {},
	getErrorKey: (name, message) => `${name}:${message}`,
	errorStates: {},
}
