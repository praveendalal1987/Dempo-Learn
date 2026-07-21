// Access-control policy for stored objects.
//
// The policy is persisted as object custom metadata (see StoredObject in
// objectStorage.ts). This module is storage-agnostic: it operates on any
// object that satisfies `AclCapableObject`, so it does not depend on a
// particular storage SDK.

// Can be flexibly defined according to the use case.
//
// Examples:
// - USER_LIST: the users from a list stored in the database;
// - EMAIL_DOMAIN: the users whose email is in a specific domain;
// - GROUP_MEMBER: the users who are members of a specific group;
// - SUBSCRIBER: the users who are subscribers of a specific service / content
//   creator.
export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  // The logic id that identifies qualified group members. Format depends on the
  // ObjectAccessGroupType — e.g. a user-list DB id, an email domain, a group id.
  id: string;
}

export enum ObjectPermission {
  READ = 'read',
  WRITE = 'write',
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

// Stored as object custom metadata (JSON string).
export interface ObjectAclPolicy {
  owner: string;
  visibility: 'public' | 'private';
  aclRules?: Array<ObjectAclRule>;
}

/**
 * A storage object that can carry and report an ACL policy. Implemented by
 * StoredObject in objectStorage.ts; kept as an interface here so this module
 * stays decoupled from the storage backend.
 */
export interface AclCapableObject {
  readonly name: string;
  exists(): Promise<boolean>;
  getAclPolicy(): Promise<ObjectAclPolicy | null>;
  setAclPolicy(policy: ObjectAclPolicy): Promise<void>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    // Implement per access group type, e.g.:
    // case "USER_LIST":
    //   return new UserListAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

export async function setObjectAclPolicy(
  objectFile: AclCapableObject,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  if (!(await objectFile.exists())) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }
  await objectFile.setAclPolicy(aclPolicy);
}

export async function getObjectAclPolicy(
  objectFile: AclCapableObject,
): Promise<ObjectAclPolicy | null> {
  return objectFile.getAclPolicy();
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: AclCapableObject;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await objectFile.getAclPolicy();
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === 'public' &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
