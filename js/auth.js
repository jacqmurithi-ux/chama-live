export async function getMyGroup() {

  if (cachedGroup) {
    return cachedGroup;
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "get_my_group"
  );

  if (error) {

    console.error(
      "get_my_group:",
      error
    );

    throw error;
  }

  cachedGroup =
    Array.isArray(data)
      ? data[0] || null
      : data || null;

  return cachedGroup;
}
