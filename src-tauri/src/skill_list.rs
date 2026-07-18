use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};

const SKILL_LIST_URL: &str =
    "https://raw.githubusercontent.com/alexdcd/Mafia-Claude-Skills/main/list.json";
const BUNDLED_SKILL_LIST: &str = include_str!("../skill-list.json");
const MAX_TARBALL_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct SkillList {
    pub(crate) version: u32,
    pub(crate) skills: Vec<ListedSkill>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct ListedSkill {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) source: ListedSource,
    #[serde(default)]
    pub(crate) upstream: Option<ListedUpstream>,
    #[serde(default)]
    pub(crate) techs: Vec<String>,
    #[serde(default)]
    pub(crate) note: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct ListedSource {
    pub(crate) repo: String,
    pub(crate) path: String,
    pub(crate) commit: String,
    pub(crate) sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct ListedUpstream {
    pub(crate) repo: String,
    #[serde(default)]
    pub(crate) commit: Option<String>,
}

fn validate_list(list: &SkillList) -> Result<(), String> {
    if list.version != 1 {
        return Err(format!("Unsupported skill list version {}", list.version));
    }
    for skill in &list.skills {
        let valid_repo = skill.source.repo.split('/').count() == 2
            && skill.source.repo.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | '/')
            });
        let valid_commit = skill.source.commit.len() == 40
            && skill
                .source
                .commit
                .chars()
                .all(|character| character.is_ascii_hexdigit());
        let valid_hash = skill.source.sha256.len() == 64
            && skill
                .source
                .sha256
                .chars()
                .all(|character| character.is_ascii_hexdigit());
        let valid_path = !skill.source.path.is_empty()
            && !skill.source.path.starts_with('/')
            && !skill
                .source
                .path
                .split('/')
                .any(|segment| segment.is_empty() || segment == "." || segment == "..");
        if !(valid_repo && valid_commit && valid_hash && valid_path) {
            return Err(format!("Skill list entry {} has an invalid source pin", skill.id));
        }
    }
    Ok(())
}

fn parse_list(contents: &str) -> Result<SkillList, String> {
    let list: SkillList = serde_json::from_str(contents)
        .map_err(|error| format!("The skill list is not valid JSON: {error}"))?;
    validate_list(&list)?;
    Ok(list)
}

pub(crate) fn bundled_skill_list() -> Result<SkillList, String> {
    parse_list(BUNDLED_SKILL_LIST)
}

/// Loads the curated list from the published repo, falling back to the copy
/// bundled at build time so installation keeps working offline.
pub(crate) async fn load_skill_list() -> Result<SkillList, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("skill-control")
        .build()
        .map_err(|error| error.to_string())?;
    let remote = async {
        let response = client.get(SKILL_LIST_URL).send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        let body = response.text().await.ok()?;
        parse_list(&body).ok()
    }
    .await;
    match remote {
        Some(list) => Ok(list),
        None => bundled_skill_list(),
    }
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let path = entry.path();
        if file_type.is_symlink() {
            return Err(format!(
                "The downloaded skill contains a symlink ({}) and cannot be verified.",
                path.to_string_lossy()
            ));
        }
        if file_type.is_dir() {
            collect_files(root, &path, out)?;
        } else if file_type.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|error| error.to_string())?
                .components()
                .map(|component| component.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/");
            out.push(relative);
        }
    }
    Ok(())
}

/// Deterministic content hash of a skill folder. Must stay byte-identical to
/// the list repo's algorithm (scripts/lib.mjs): sha256 over
/// "<relpath>\0<sha256(file)>\n" lines, files sorted by relative path.
pub(crate) fn bundle_hash(skill_dir: &Path) -> Result<String, String> {
    let mut files = Vec::new();
    collect_files(skill_dir, skill_dir, &mut files)?;
    files.sort();
    let mut concatenated = String::new();
    for relative in &files {
        let content =
            fs::read(skill_dir.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR)))
                .map_err(|error| error.to_string())?;
        concatenated.push_str(&format!("{relative}\0{}\n", hash_bytes(&content)));
    }
    Ok(hash_bytes(concatenated.as_bytes()))
}

/// Downloads repo@commit as a tarball from codeload and extracts only the
/// skill folder into `destination` (which must not exist yet). Symlinks and
/// paths escaping the destination are rejected.
pub(crate) async fn download_skill_folder(
    repo: &str,
    commit: &str,
    skill_path: &str,
    destination: &Path,
) -> Result<(), String> {
    let url = format!("https://codeload.github.com/{repo}/tar.gz/{commit}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("skill-control")
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|error| format!("Could not download {repo}@{commit}: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Could not download {repo}@{} (HTTP {}). The pinned commit may no longer exist.",
            &commit[..7.min(commit.len())],
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Download interrupted: {error}"))?;
    if bytes.len() as u64 > MAX_TARBALL_BYTES {
        return Err("The source repository archive is too large.".into());
    }

    fs::create_dir_all(destination).map_err(|error| error.to_string())?;
    let mut archive = tar::Archive::new(GzDecoder::new(bytes.as_ref()));
    let mut extracted_any = false;
    for entry in archive.entries().map_err(|error| error.to_string())? {
        let mut entry = entry.map_err(|error| error.to_string())?;
        let entry_path = entry.path().map_err(|error| error.to_string())?.into_owned();
        // Tarball paths are "<repo>-<commit>/<path...>": drop the root folder.
        let mut components = entry_path.components();
        components.next();
        let inner: PathBuf = components.as_path().to_path_buf();
        let inner_str = inner.to_string_lossy().replace('\\', "/");
        let prefix = format!("{}/", skill_path.trim_end_matches('/'));
        let relative = if let Some(stripped) = inner_str.strip_prefix(&prefix) {
            stripped.to_string()
        } else {
            continue;
        };
        if relative.is_empty() {
            continue;
        }
        if relative
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        {
            return Err(format!("The archive contains an unsafe path: {inner_str}"));
        }
        let target = destination.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
        match entry.header().entry_type() {
            tar::EntryType::Directory => {
                fs::create_dir_all(&target).map_err(|error| error.to_string())?;
            }
            tar::EntryType::Regular => {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
                }
                let mut content = Vec::new();
                entry
                    .read_to_end(&mut content)
                    .map_err(|error| error.to_string())?;
                fs::write(&target, content).map_err(|error| error.to_string())?;
                extracted_any = true;
            }
            tar::EntryType::Symlink | tar::EntryType::Link => {
                return Err(format!(
                    "The skill contains a link entry ({inner_str}) and cannot be installed automatically."
                ));
            }
            _ => continue,
        }
    }
    if !extracted_any {
        return Err(format!(
            "The folder {skill_path} was not found in {repo}@{}.",
            &commit[..7.min(commit.len())]
        ));
    }
    if !destination.join("SKILL.md").is_file() {
        return Err("The downloaded folder does not contain a SKILL.md.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{bundle_hash, bundled_skill_list, parse_list};
    use std::{env, fs};

    #[test]
    fn bundled_list_parses_and_validates() {
        let list = bundled_skill_list().expect("bundled list should be valid");
        assert!(list.skills.len() > 200);
        assert!(list.skills.iter().any(|skill| skill.id == "next-best-practices"));
        assert!(list.skills.iter().any(|skill| skill.id == "mafia-frontend-design"));
    }

    #[test]
    fn rejects_invalid_source_pins() {
        let json = r#"{"version":1,"skills":[{"id":"x","name":"x","source":{"repo":"a/b","path":"../evil","commit":"0000000000000000000000000000000000000000","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}}]}"#;
        assert!(parse_list(json).is_err());
    }

    #[test]
    fn bundle_hash_matches_reference_algorithm() {
        let dir = env::temp_dir().join(format!("bundle-hash-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("SKILL.md"), "hello\n").unwrap();
        fs::write(dir.join("sub/extra.txt"), "world\n").unwrap();
        // Reference value produced by the list repo's scripts/lib.mjs bundleHash
        // over the same fixture. Guards cross-implementation compatibility.
        let hash = bundle_hash(&dir).expect("hash should compute");
        fs::remove_dir_all(&dir).unwrap();
        assert_eq!(
            hash,
            "d12b5af706b97bd31522e8adce64c807ca7edbb72fcd070d3540d6aabd933cc9"
        );
    }
}
