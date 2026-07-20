use crate::skill_list::{validate_source_pin, ListedSkill};
use serde::{Deserialize, Serialize};
use std::time::Duration;

const PACK_LIST_URL: &str =
    "https://raw.githubusercontent.com/alexdcd/Mafia-Claude-Skills/main/packs.json";
const BUNDLED_PACK_LIST: &str = include_str!("../pack-list.json");

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct SkillPack {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: String,
    #[serde(default)]
    pub(crate) category: String,
    pub(crate) skills: Vec<ListedSkill>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct PackList {
    pub(crate) version: u32,
    pub(crate) packs: Vec<SkillPack>,
}

fn validate_list(list: &PackList) -> Result<(), String> {
    if list.version != 1 {
        return Err(format!("Unsupported pack list version {}", list.version));
    }
    for pack in &list.packs {
        for skill in &pack.skills {
            validate_source_pin(&skill.source)
                .map_err(|_| format!("Pack {} entry {} has an invalid source pin", pack.id, skill.id))?;
        }
    }
    Ok(())
}

fn parse_list(contents: &str) -> Result<PackList, String> {
    let list: PackList = serde_json::from_str(contents)
        .map_err(|error| format!("The pack list is not valid JSON: {error}"))?;
    validate_list(&list)?;
    Ok(list)
}

pub(crate) fn bundled_pack_list() -> Result<PackList, String> {
    parse_list(BUNDLED_PACK_LIST)
}

/// Loads the curated pack list from the published repo, falling back to the
/// copy bundled at build time — same pattern as `skill_list::load_skill_list`.
pub(crate) async fn load_pack_list() -> Result<PackList, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("skill-control")
        .build()
        .map_err(|error| error.to_string())?;
    let remote = async {
        let response = client.get(PACK_LIST_URL).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        let body = response.text().await.ok()?;
        parse_list(&body).ok()
    }
    .await;
    match remote {
        Some(list) => Ok(list),
        None => bundled_pack_list(),
    }
}

/// Finds a pack skill by id across every bundled/remote pack, for the shared
/// install lookup in `install_listed_skill`.
pub(crate) fn find_skill(list: &PackList, skill_id: &str) -> Option<ListedSkill> {
    list.packs
        .iter()
        .flat_map(|pack| &pack.skills)
        .find(|skill| skill.id == skill_id)
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::bundled_pack_list;

    #[test]
    fn bundled_pack_list_parses_and_validates() {
        let list = bundled_pack_list().expect("bundled pack list should be valid");
        assert_eq!(list.packs.len(), 4);
        let ids: Vec<&str> = list.packs.iter().map(|pack| pack.id.as_str()).collect();
        assert!(ids.contains(&"marketing"));
        assert!(ids.contains(&"ads"));
        assert!(ids.contains(&"social"));
        assert!(ids.contains(&"superpowers"));
        let total_skills: usize = list.packs.iter().map(|pack| pack.skills.len()).sum();
        assert_eq!(total_skills, 28);
    }

    #[test]
    fn pack_skill_ids_are_unique_and_dont_collide_with_the_main_list() {
        let packs = bundled_pack_list().expect("bundled pack list should be valid");
        let main = crate::skill_list::bundled_skill_list().expect("bundled skill list should be valid");
        let mut seen = std::collections::HashSet::new();
        for pack in &packs.packs {
            for skill in &pack.skills {
                assert!(seen.insert(skill.id.clone()), "duplicate pack skill id {}", skill.id);
                assert!(
                    !main.skills.iter().any(|candidate| candidate.id == skill.id),
                    "pack skill id {} collides with the main skill list",
                    skill.id
                );
            }
        }
    }
}
