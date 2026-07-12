use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Installation {
    id: String,
    path: String,
    scope: String,
    agent: String,
    enabled: bool,
    modified: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Skill {
    id: String,
    name: String,
    description: String,
    version: Option<String>,
    source: Option<String>,
    installations: Vec<Installation>,
    files: Vec<String>,
    executable_scripts: Vec<String>,
    context_tokens: usize,
    source_hash: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Finding {
    id: String,
    skill_id: String,
    severity: String,
    title: String,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanReport {
    skills: Vec<Skill>,
    findings: Vec<Finding>,
    scanned_paths: Vec<String>,
    agents: Vec<String>,
    scanned_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChangePreview {
    title: String,
    changes: Vec<String>,
    warnings: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveEntry {
    id: String,
    skill_name: String,
    source_path: String,
    archive_path: String,
    created_at: String,
}

#[derive(Clone)]
struct CandidatePath {
    path: PathBuf,
    scope: String,
    agent: String,
}

fn agent_paths(projects: &[String]) -> Vec<CandidatePath> {
    let mut candidates = Vec::new();
    if let Some(home) = dirs::home_dir() {
        for (agent, relative) in [
            ("agents", ".agents/skills"),
            ("codex", ".codex/skills"),
            ("claude", ".claude/skills"),
        ] {
            candidates.push(CandidatePath { path: home.join(relative), scope: "user".into(), agent: agent.into() });
        }
    }

    let roots: Vec<PathBuf> = if projects.is_empty() {
        std::env::current_dir().ok().into_iter().collect()
    } else {
        projects.iter().map(PathBuf::from).collect()
    };
    for root in roots {
        for (agent, relative) in [
            ("agents", ".agents/skills"),
            ("codex", ".codex/skills"),
            ("claude", ".claude/skills"),
        ] {
            candidates.push(CandidatePath { path: root.join(relative), scope: "project".into(), agent: agent.into() });
        }
    }
    candidates
}

fn frontmatter(content: &str) -> (HashMap<String, String>, bool) {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") { return (HashMap::new(), false); }
    let mut values = HashMap::new();
    for line in lines.by_ref() {
        if line.trim() == "---" { return (values, true); }
        if let Some((key, value)) = line.split_once(':') {
            values.insert(key.trim().to_lowercase(), value.trim().trim_matches('"').trim_matches('\'').to_owned());
        }
    }
    (HashMap::new(), false)
}

fn files_in(directory: &Path, root: &Path, executable_scripts: &mut Vec<String>) -> Vec<String> {
    let mut files = Vec::new();
    let Ok(entries) = fs::read_dir(directory) else { return files; };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() { files.extend(files_in(&path, root, executable_scripts)); continue; }
        let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
        #[cfg(unix)]
        if relative.starts_with("scripts/") {
            use std::os::unix::fs::PermissionsExt;
            if entry.metadata().map(|m| m.permissions().mode() & 0o111 != 0).unwrap_or(false) { executable_scripts.push(relative.clone()); }
        }
        files.push(relative);
    }
    files.sort();
    files
}

fn scan_candidate(candidate: &CandidatePath) -> Vec<(Skill, Vec<Finding>)> {
    let Ok(entries) = fs::read_dir(&candidate.path) else { return Vec::new(); };
    entries.flatten().filter_map(|entry| {
        let skill_path = entry.path();
        if !skill_path.is_dir() { return None; }
        let definition = skill_path.join("SKILL.md");
        let Ok(content) = fs::read_to_string(&definition) else { return None; };
        let folder_name = skill_path.file_name()?.to_string_lossy().to_string();
        let (metadata, complete_frontmatter) = frontmatter(&content);
        let name = metadata.get("name").filter(|value| !value.is_empty()).cloned().unwrap_or_else(|| folder_name.clone());
        let id = name.clone();
        let mut hash = DefaultHasher::new();
        content.hash(&mut hash);
        let mut executable_scripts = Vec::new();
        let files = files_in(&skill_path, &skill_path, &mut executable_scripts);
        let mut findings = Vec::new();
        if !complete_frontmatter {
            findings.push(Finding { id: format!("{id}-metadata"), skill_id: id.clone(), severity: "warning".into(), title: "Incomplete frontmatter".into(), detail: "SKILL.md should begin and end its YAML frontmatter with ---".into() });
        }
        if metadata.get("description").map(|description| description.trim().is_empty()).unwrap_or(true) {
            findings.push(Finding { id: format!("{id}-description"), skill_id: id.clone(), severity: "error".into(), title: "Missing description".into(), detail: "Add a specific description so agents can select this skill reliably.".into() });
        }
        if name != folder_name {
            findings.push(Finding { id: format!("{id}-name"), skill_id: id.clone(), severity: "warning".into(), title: "Folder and skill name differ".into(), detail: format!("Folder is {folder_name}; frontmatter name is {name}.") });
        }
        if content.len() > 20_000 {
            findings.push(Finding { id: format!("{id}-length"), skill_id: id.clone(), severity: "warning".into(), title: "Large activation footprint".into(), detail: "Move detailed reference material out of SKILL.md so it can load progressively.".into() });
        }
        if !executable_scripts.is_empty() {
            findings.push(Finding { id: format!("{id}-scripts"), skill_id: id.clone(), severity: "warning".into(), title: "Executable scripts detected".into(), detail: format!("Review before use: {}.", executable_scripts.join(", ")) });
        }
        let installation_path = skill_path.to_string_lossy().to_string();
        let installation = Installation { id: format!("{}:{}", candidate.agent, installation_path), path: installation_path, scope: candidate.scope.clone(), agent: candidate.agent.clone(), enabled: true, modified: false };
        Some((Skill { id, name, description: metadata.get("description").cloned().unwrap_or_default(), version: metadata.get("version").cloned(), source: metadata.get("source").cloned(), installations: vec![installation], files, executable_scripts, context_tokens: (content.split_whitespace().count() as f32 * 1.3).ceil() as usize, source_hash: format!("{:x}", hash.finish()) }, findings))
    }).collect()
}

fn unix_seconds() -> String {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs().to_string()
}

fn unix_millis() -> String {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis().to_string()
}

fn archive_database_path() -> Result<PathBuf, String> {
    Ok(dirs::home_dir().ok_or("Could not determine your home folder")?.join(".skill-control").join("state.db"))
}

fn open_archive_database(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection.execute_batch("CREATE TABLE IF NOT EXISTS archives (id TEXT PRIMARY KEY, skill_name TEXT NOT NULL, source_path TEXT NOT NULL, archive_path TEXT NOT NULL, created_at TEXT NOT NULL);").map_err(|error| error.to_string())?;
    Ok(connection)
}

fn record_archive(entry: &ArchiveEntry) -> Result<(), String> {
    let database = open_archive_database(&archive_database_path()?)?;
    database.execute("INSERT INTO archives (id, skill_name, source_path, archive_path, created_at) VALUES (?1, ?2, ?3, ?4, ?5)", params![entry.id, entry.skill_name, entry.source_path, entry.archive_path, entry.created_at]).map_err(|error| error.to_string())?;
    Ok(())
}

fn remove_archive_record(id: &str) -> Result<(), String> {
    let database = open_archive_database(&archive_database_path()?)?;
    database.execute("DELETE FROM archives WHERE id = ?1", params![id]).map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn scan_skills(projects: Vec<String>) -> ScanReport {
    let mut combined: HashMap<String, Skill> = HashMap::new();
    let mut findings = Vec::new();
    let candidates = agent_paths(&projects);
    let scanned_paths = candidates.iter().map(|candidate| candidate.path.to_string_lossy().to_string()).collect();
    let mut agents: Vec<String> = candidates.iter().filter(|candidate| candidate.path.exists()).map(|candidate| candidate.agent.clone()).collect();
    agents.sort(); agents.dedup();
    for candidate in &candidates {
        for (skill, mut skill_findings) in scan_candidate(candidate) {
            if let Some(existing) = combined.get_mut(&skill.id) { existing.installations.extend(skill.installations); } else { combined.insert(skill.id.clone(), skill); }
            findings.append(&mut skill_findings);
        }
    }
    for skill in combined.values() {
        if skill.installations.len() > 1 {
            findings.push(Finding { id: format!("{}-duplicate", skill.id), skill_id: skill.id.clone(), severity: "info".into(), title: "Multiple installations".into(), detail: "A project installation takes priority over a user installation.".into() });
        }
    }
    let mut skills: Vec<Skill> = combined.into_values().collect();
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    ScanReport { skills, findings, scanned_paths, agents, scanned_at: unix_seconds() }
}

#[tauri::command]
fn preview_disable(installation: Installation) -> ChangePreview {
    ChangePreview { title: format!("Disable {}", installation.path.rsplit('/').next().unwrap_or("skill")), changes: vec![format!("Move {} to Skill Control's disabled archive", installation.path)], warnings: vec!["The skill will no longer be discovered by this agent. A backup is retained and can be restored later.".into()] }
}

#[tauri::command]
fn disable_skill(installation: Installation) -> Result<ArchiveEntry, String> {
    let source = PathBuf::from(&installation.path);
    if !source.exists() { return Err("The skill no longer exists at this path. Scan again before applying this change.".into()); }
    let home = dirs::home_dir().ok_or("Could not determine your home folder")?;
    let skill_name = source.file_name().and_then(|name| name.to_str()).unwrap_or("skill").to_string();
    let id = format!("{}-{}", skill_name, unix_millis());
    let archive = home.join(".skill-control").join("disabled").join(&id);
    fs::create_dir_all(archive.parent().ok_or("Could not create the archive folder")?).map_err(|error| error.to_string())?;
    fs::rename(&source, &archive).map_err(|error| format!("Could not archive skill: {error}"))?;
    let entry = ArchiveEntry { id, skill_name, source_path: source.to_string_lossy().to_string(), archive_path: archive.to_string_lossy().to_string(), created_at: unix_seconds() };
    if let Err(error) = record_archive(&entry) {
        let _ = fs::rename(&archive, &source);
        return Err(format!("Could not record the archive: {error}"));
    }
    Ok(entry)
}

#[tauri::command]
fn restore_skill(archive: ArchiveEntry) -> Result<(), String> {
    let source = PathBuf::from(&archive.source_path);
    let archived = PathBuf::from(&archive.archive_path);
    if source.exists() { return Err("A skill already exists at the original location. Move it before restoring this archive.".into()); }
    if !archived.exists() { return Err("The archived copy no longer exists. It cannot be restored.".into()); }
    fs::create_dir_all(source.parent().ok_or("Could not determine the original skill folder")?).map_err(|error| error.to_string())?;
    fs::rename(&archived, &source).map_err(|error| format!("Could not restore skill: {error}"))?;
    if let Err(error) = remove_archive_record(&archive.id) {
        let _ = fs::rename(&source, &archived);
        return Err(format!("Could not update archive history: {error}"));
    }
    Ok(())
}

#[tauri::command]
fn install_catalog_skill(skill_id: String, target: String, project_path: Option<String>) -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Could not determine your home folder")?;
    let target_root = match target.as_str() {
        "project" => PathBuf::from(project_path.ok_or("Choose a project before installing to project scope.")?).join(".agents/skills"),
        "codex" => home.join(".codex/skills"),
        "claude" => home.join(".claude/skills"),
        _ => home.join(".agents/skills"),
    };
    let destination = target_root.join(&skill_id);
    if destination.exists() { return Err("This skill already exists at the chosen target. Use the map to inspect it first.".into()); }
    let catalog: HashMap<&str, (&str, &str)> = HashMap::from([
        ("repo-hygiene", ("Keep repositories small, predictable and easy for agents to navigate.", "Review file structure, name modules clearly, remove generated artifacts from version control, and prefer focused changes.")),
        ("web-performance", ("Diagnose rendering, assets and loading bottlenecks before users feel them.", "Measure first. Address unnecessary network requests, render work, asset weight, and avoid speculative rewrites.")),
        ("api-contracts", ("Design compatible API changes and document important constraints.", "Make contracts explicit, preserve backwards compatibility where practical, and add contract tests for changes.")),
    ]);
    let (description, instructions) = catalog.get(skill_id.as_str()).ok_or("Unknown catalog skill")?;
    fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
    fs::write(destination.join("SKILL.md"), format!("---\nname: {skill_id}\ndescription: {description}\nversion: 1.0.0\nsource: Skill Control curated library\n---\n\n# {skill_id}\n\n{instructions}\n")).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![scan_skills, preview_disable, disable_skill, restore_skill, install_catalog_skill])
        .run(tauri::generate_context!())
        .expect("error while running Skill Control")
}

#[cfg(test)]
mod tests {
    use super::{frontmatter, open_archive_database};
    use std::{env, fs};

    #[test]
    fn parses_quoted_frontmatter_values() {
        let (values, complete) = frontmatter("---\nname: sample\ndescription: 'Useful skill'\n---\nBody");
        assert!(complete);
        assert_eq!(values.get("name"), Some(&"sample".to_string()));
        assert_eq!(values.get("description"), Some(&"Useful skill".to_string()));
    }

    #[test]
    fn rejects_unterminated_frontmatter() {
        let (_, complete) = frontmatter("---\nname: sample\nBody");
        assert!(!complete);
    }

    #[test]
    fn initializes_an_archive_database() {
        let path = env::temp_dir().join(format!("skill-control-{}.db", super::unix_millis()));
        let database = open_archive_database(&path).expect("database should initialize");
        let table_exists: i32 = database.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='archives'", [], |row| row.get(0)).expect("archives table should exist");
        assert_eq!(table_exists, 1);
        drop(database);
        fs::remove_file(path).expect("temporary database should clean up");
    }
}
