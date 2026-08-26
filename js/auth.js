export async function getMyGroupId() {

  const member = await getMyMember();

  if (member?.group_id) {
    return member.group_id;
  }

  const {
    data,
    error
  } = await supabase.rpc("my_group_id");

  if (error) {
    console.error("my_group_id error:", error);
    throw error;
  }

  return data || null;
}
