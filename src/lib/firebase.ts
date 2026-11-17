// Compatibility exports for the existing screens; no Firebase connection.
export { auth, ADMIN_BOOTSTRAP_EMAIL, signOutUser } from './session';
export { db } from './records';
export enum OperationType { CREATE='create',UPDATE='update',DELETE='delete',LIST='list',GET='get',WRITE='write' }
export function handleFirestoreError(error:unknown,_operation:OperationType,_path:string|null):never {throw error instanceof Error?error:new Error('Unable to complete the request.');}
