use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    collections::{hash_map::DefaultHasher, HashMap, HashSet},
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_PROJECT_SCAN_DEPTH: usize = 8;
const AGENT_SKILL_PATHS: [(&str, &str); 2] =
    [("codex", ".agents/skills"), ("claude", ".claude/skills")];
const PROJECT_MARKERS: [&str; 10] = [
    ".git",
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
    "pom.xml",
    "composer.json",
    "Gemfile",
    "deno.json",
    "Makefile",
];
const SKIPPED_DIRECTORIES: [&str; 16] = [
    ".git",
    ".agents",
    ".claude",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".turbo",
    ".venv",
    "venv",
    "vendor",
    "Library",
    "coverage",
    ".cache",
];

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Installation {
    id: String,
    path: String,
    scope: String,
    agent: String,
    project_path: Option<String>,
    enabled: bool,
    modified: bool,
    source_hash: String,
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSummary {
    path: String,
    name: String,
    agents: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanReport {
    skills: Vec<Skill>,
    findings: Vec<Finding>,
    scanned_paths: Vec<String>,
    projects: Vec<ProjectSummary>,
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
    project_path: Option<PathBuf>,
}

fn normalize_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn path_key(path: &Path) -> String {
    normalize_path(path).to_string_lossy().replace('\\', "/")
}

fn project_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Project")
        .to_string()
}

fn agent_relative_path(agent: &str) -> Option<&'static str> {
    AGENT_SKILL_PATHS
        .iter()
        .find_map(|(candidate, relative)| (*candidate == agent).then_some(*relative))
}

fn has_project_marker(path: &Path) -> bool {
    PROJECT_MARKERS
        .iter()
        .any(|marker| path.join(marker).exists())
}

fn has_skill_root(path: &Path) -> bool {
    AGENT_SKILL_PATHS
        .iter()
        .any(|(_, relative)| path.join(relative).is_dir())
}

fn should_skip_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| SKIPPED_DIRECTORIES.contains(&name))
        .unwrap_or(false)
}

fn discover_projects(root: &Path, max_depth: usize) -> Vec<PathBuf> {
    fn walk(
        current: &Path,
        depth: usize,
        max_depth: usize,
        projects: &mut Vec<PathBuf>,
        seen: &mut HashSet<String>,
    ) {
        if has_project_marker(current) || has_skill_root(current) {
            let normalized = normalize_path(current);
            if seen.insert(path_key(&normalized)) {
                projects.push(normalized);
            }
        }

        if depth >= max_depth {
            return;
        }

        let Ok(entries) = fs::read_dir(current) else {
            return;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() || file_type.is_symlink() {
                continue;
            }
            let path = entry.path();
            if should_skip_directory(&path) {
                continue;
            }
            walk(&path, depth + 1, max_depth, projects, seen);
        }
    }

    let mut projects = Vec::new();
    let mut seen = HashSet::new();
    walk(root, 0, max_depth, &mut projects, &mut seen);

    // A manually selected folder remains a valid local install scope even when
    // it has no conventional project marker yet.
    if root.is_dir() {
        let normalized = normalize_path(root);
        if seen.insert(path_key(&normalized)) {
            projects.push(normalized);
        }
    }

    projects.sort_by(|a, b| path_key(a).cmp(&path_key(b)));
    projects
}

fn push_candidate(
    candidates: &mut Vec<CandidatePath>,
    seen: &mut HashSet<String>,
    path: PathBuf,
    scope: &str,
    agent: &str,
    project_path: Option<PathBuf>,
) {
    let key = format!("{scope}:{agent}:{}", path_key(&path));
    if seen.insert(key) {
        candidates.push(CandidatePath {
            path,
            scope: scope.into(),
            agent: agent.into(),
            project_path,
        });
    }
}

fn agent_paths(workspace_roots: &[String]) -> Vec<CandidatePath> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();

    if let Some(home) = dirs::home_dir() {
        for (agent, relative) in AGENT_SKILL_PATHS {
            push_candidate(
                &mut candidates,
                &mut seen,
                home.join(relative),
                "user",
                agent,
                None,
            );
        }
    }

    // A desktop app has no reliable "current project" when launched from the
    // dock or file explorer. Only explicitly selected workspace roots are scanned.
    let roots: Vec<PathBuf> = workspace_roots.iter().map(PathBuf::from).collect();

    for root in roots {
        if !root.is_dir() {
            continue;
        }
        for project in discover_projects(&root, MAX_PROJECT_SCAN_DEPTH) {
            for (agent, relative) in AGENT_SKILL_PATHS {
                push_candidate(
                    &mut candidates,
                    &mut seen,
                    project.join(relative),
                    "project",
                    agent,
                    Some(project.clone()),
                );
            }
        }
    }

    candidates
}

fn project_summaries(candidates: &[CandidatePath]) -> Vec<ProjectSummary> {
    let mut projects: HashMap<String, ProjectSummary> = HashMap::new();

    for candidate in candidates {
        let Some(project_path) = candidate.project_path.as_ref() else {
            continue;
        };
        let normalized = normalize_path(project_path);
        let key = path_key(&normalized);
        let summary = projects.entry(key).or_insert_with(|| ProjectSummary {
            path: normalized.to_string_lossy().to_string(),
            name: project_name(&normalized),
            agents: Vec::new(),
        });
        if candidate.path.is_dir() && !summary.agents.contains(&candidate.agent) {
            summary.agents.push(candidate.agent.clone());
        }
    }

    let mut projects: Vec<ProjectSummary> = projects.into_values().collect();
    for project in &mut projects {
        project.agents.sort();
    }
    projects.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.path.cmp(&b.path)));
    projects
}

fn frontmatter(content: &str) -> (HashMap<String, String>, bool) {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (HashMap::new(), false);
    }
    let mut values = HashMap::new();
    for line in lines.by_ref() {
        if line.trim() == "---" {
            return (values, true);
        }
        if let Some((key, value)) = line.split_once(':') {
            values.insert(
                key.trim().to_lowercase(),
                value.trim().trim_matches('"').trim_matches('\'').to_owned(),
            );
        }
    }
    (HashMap::new(), false)
}

fn files_in(directory: &Path, root: &Path, executable_scripts: &mut Vec<String>) -> Vec<String> {
    let mut files = Vec::new();
    let Ok(entries) = fs::read_dir(directory) else {
        return files;
    };
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            files.extend(files_in(&path, root, executable_scripts));
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();
        #[cfg(unix)]
        if path
            .strip_prefix(root)
            .ok()
            .and_then(|relative_path| relative_path.components().next())
            .map(|component| component.as_os_str() == "scripts")
            .unwrap_or(false)
        {
            use std::os::unix::fs::PermissionsExt;
            if entry
                .metadata()
                .map(|metadata| metadata.permissions().mode() & 0o111 != 0)
                .unwrap_or(false)
            {
                executable_scripts.push(relative.clone());
            }
        }
        files.push(relative);
    }
    files.sort();
    files
}

fn skill_hash(root: &Path, files: &[String]) -> String {
    let mut hash = DefaultHasher::new();
    for relative in files {
        relative.hash(&mut hash);
        match fs::read(root.join(relative)) {
            Ok(content) => content.hash(&mut hash),
            Err(_) => "<unreadable>".hash(&mut hash),
        }
    }
    format!("{:x}", hash.finish())
}

fn scan_candidate(candidate: &CandidatePath) -> Vec<(Skill, Vec<Finding>)> {
    let Ok(entries) = fs::read_dir(&candidate.path) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let Ok(file_type) = entry.file_type() else {
                return None;
            };
            let skill_path = entry.path();
            let is_skill_directory = file_type.is_dir()
                || (file_type.is_symlink() && skill_path.is_dir());
            if !is_skill_directory {
                return None;
            }
            let definition = skill_path.join("SKILL.md");
            let Ok(content) = fs::read_to_string(&definition) else {
                return None;
            };
            let folder_name = skill_path.file_name()?.to_string_lossy().to_string();
            let (metadata, complete_frontmatter) = frontmatter(&content);
            let name = metadata
                .get("name")
                .filter(|value| !value.is_empty())
                .cloned()
                .unwrap_or_else(|| folder_name.clone());
            let id = name.clone();
            let mut executable_scripts = Vec::new();
            let files = files_in(&skill_path, &skill_path, &mut executable_scripts);
            let source_hash = skill_hash(&skill_path, &files);
            let installation_path = skill_path.to_string_lossy().to_string();
            let installation_id = format!("{}:{}", candidate.agent, installation_path);
            let finding_suffix = {
                let mut installation_hash = DefaultHasher::new();
                installation_id.hash(&mut installation_hash);
                format!("{:x}", installation_hash.finish())
            };
            let mut findings = Vec::new();
            if !complete_frontmatter {
                findings.push(Finding {
                    id: format!("{id}-metadata-{finding_suffix}"),
                    skill_id: id.clone(),
                    severity: "warning".into(),
                    title: "Incomplete frontmatter".into(),
                    detail: "SKILL.md should begin and end its YAML frontmatter with ---".into(),
                });
            }
            if metadata
                .get("description")
                .map(|description| description.trim().is_empty())
                .unwrap_or(true)
            {
                findings.push(Finding {
                    id: format!("{id}-description-{finding_suffix}"),
                    skill_id: id.clone(),
                    severity: "error".into(),
                    title: "Missing description".into(),
                    detail: "Add a specific description so agents can select this skill reliably."
                        .into(),
                });
            }
            if name != folder_name {
                findings.push(Finding {
                    id: format!("{id}-name-{finding_suffix}"),
                    skill_id: id.clone(),
                    severity: "warning".into(),
                    title: "Folder and skill name differ".into(),
                    detail: format!("Folder is {folder_name}; frontmatter name is {name}."),
                });
            }
            if content.len() > 20_000 {
                findings.push(Finding {
                    id: format!("{id}-length-{finding_suffix}"),
                    skill_id: id.clone(),
                    severity: "warning".into(),
                    title: "Large activation footprint".into(),
                    detail: "Move detailed reference material out of SKILL.md so it can load progressively."
                        .into(),
                });
            }
            if !executable_scripts.is_empty() {
                findings.push(Finding {
                    id: format!("{id}-scripts-{finding_suffix}"),
                    skill_id: id.clone(),
                    severity: "warning".into(),
                    title: "Executable scripts detected".into(),
                    detail: format!("Review before use: {}.", executable_scripts.join(", ")),
                });
            }
            let installation = Installation {
                id: installation_id,
                path: installation_path,
                scope: candidate.scope.clone(),
                agent: candidate.agent.clone(),
                project_path: candidate
                    .project_path
                    .as_ref()
                    .map(|path| path.to_string_lossy().to_string()),
                enabled: true,
                modified: false,
                source_hash: source_hash.clone(),
            };
            Some((
                Skill {
                    id,
                    name,
                    description: metadata.get("description").cloned().unwrap_or_default(),
                    version: metadata.get("version").cloned(),
                    source: metadata.get("source").cloned(),
                    installations: vec![installation],
                    files,
                    executable_scripts,
                    context_tokens: (content.split_whitespace().count() as f32 * 1.3).ceil()
                        as usize,
                    source_hash,
                },
                findings,
            ))
        })
        .collect()
}

fn unix_seconds() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

fn unix_millis() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}

fn archive_database_path() -> Result<PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or("Could not determine your home folder")?
        .join(".skill-control")
        .join("state.db"))
}

fn disabled_archive_root() -> Result<PathBuf, String> {
    Ok(dirs::home_dir()
        .ok_or("Could not determine your home folder")?
        .join(".skill-control")
        .join("disabled"))
}

fn open_archive_database(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection.execute_batch("CREATE TABLE IF NOT EXISTS archives (id TEXT PRIMARY KEY, skill_name TEXT NOT NULL, source_path TEXT NOT NULL, archive_path TEXT NOT NULL, created_at TEXT NOT NULL);").map_err(|error| error.to_string())?;
    Ok(connection)
}

fn record_archive(entry: &ArchiveEntry) -> Result<(), String> {
    let database = open_archive_database(&archive_database_path()?)?;
    database.execute("INSERT INTO archives (id, skill_name, source_path, archive_path, created_at) VALUES (?1, ?2, ?3, ?4, ?5)", params![entry.id, entry.skill_name, entry.source_path, entry.archive_path, entry.created_at]).map_err(|error| error.to_string())?;
    Ok(())
}

fn archive_by_id(id: &str) -> Result<ArchiveEntry, String> {
    let database = open_archive_database(&archive_database_path()?)?;
    database
        .query_row(
            "SELECT id, skill_name, source_path, archive_path, created_at FROM archives WHERE id = ?1",
            params![id],
            |row| {
                Ok(ArchiveEntry {
                    id: row.get(0)?,
                    skill_name: row.get(1)?,
                    source_path: row.get(2)?,
                    archive_path: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(|_| "The archive entry no longer exists.".to_string())
}

fn remove_archive_record(id: &str) -> Result<(), String> {
    let database = open_archive_database(&archive_database_path()?)?;
    database
        .execute("DELETE FROM archives WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn skill_root(
    home: &Path,
    scope: &str,
    agent: &str,
    project_path: Option<&str>,
) -> Result<PathBuf, String> {
    let relative = agent_relative_path(agent).ok_or("Unknown agent target")?;
    match scope {
        "user" => Ok(home.join(relative)),
        "project" => {
            let project = PathBuf::from(
                project_path.ok_or("Choose a project before installing to project scope.")?,
            );
            if !project.is_absolute() {
                return Err("The selected project path must be absolute.".into());
            }
            let project = normalize_path(&project);
            if !project.is_dir() {
                return Err("The selected project folder no longer exists.".into());
            }
            Ok(project.join(relative))
        }
        _ => Err("Unknown installation scope".into()),
    }
}

fn target_agents(target: &str) -> Result<Vec<&'static str>, String> {
    match target {
        "all" => Ok(vec!["codex", "claude"]),
        "codex" => Ok(vec!["codex"]),
        "claude" => Ok(vec!["claude"]),
        _ => Err("Unknown agent target".into()),
    }
}

fn validate_skill_id(skill_id: &str) -> Result<(), String> {
    let valid = !skill_id.is_empty()
        && skill_id.len() <= 80
        && skill_id.chars().all(|character| {
            character.is_ascii_lowercase()
                || character.is_ascii_digit()
                || character == '-'
                || character == '_'
        });
    if valid {
        Ok(())
    } else {
        Err("Invalid skill identifier.".into())
    }
}

fn expected_skill_root(installation: &Installation, home: &Path) -> Result<PathBuf, String> {
    skill_root(
        home,
        &installation.scope,
        &installation.agent,
        installation.project_path.as_deref(),
    )
}

fn validate_installation(installation: &Installation, home: &Path) -> Result<PathBuf, String> {
    let source = PathBuf::from(&installation.path);
    let metadata = fs::symlink_metadata(&source)
        .map_err(|_| "The selected path is not a valid skill installation.".to_string())?;
    if metadata.file_type().is_symlink() || !source.is_dir() || !source.join("SKILL.md").is_file() {
        return Err("The selected path is not a valid skill installation.".into());
    }
    let expected_root = normalize_path(&expected_skill_root(installation, home)?);
    let actual_parent = source
        .parent()
        .map(normalize_path)
        .ok_or("Could not determine the skill root.")?;
    if actual_parent != expected_root {
        return Err("The installation path does not match its declared scope and agent.".into());
    }
    Ok(source)
}

fn is_supported_restore_destination(path: &Path) -> bool {
    let Some(skills_directory) = path.parent() else {
        return false;
    };
    if skills_directory.file_name().and_then(|name| name.to_str()) != Some("skills") {
        return false;
    }
    matches!(
        skills_directory
            .parent()
            .and_then(|parent| parent.file_name())
            .and_then(|name| name.to_str()),
        Some(".agents") | Some(".claude")
    )
}

fn catalog_definition(skill_id: &str) -> Option<(&'static str, &'static str)> {
    match skill_id {
        "repo-hygiene" => Some((
            "Keep repositories small, predictable and easy for agents to navigate.",
            "Review file structure, name modules clearly, remove generated artifacts from version control, and prefer focused changes.",
        )),
        "web-performance" => Some((
            "Diagnose rendering, assets and loading bottlenecks before users feel them.",
            "Measure first. Address unnecessary network requests, render work, asset weight, and avoid speculative rewrites.",
        )),
        "api-contracts" => Some((
            "Design compatible API changes and document important constraints.",
            "Make contracts explicit, preserve backwards compatibility where practical, and add contract tests for changes.",
        )),
        _ => None,
    }
}

fn write_skill_atomically(destination: &Path, content: &str) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or("Could not determine the target skills folder")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = parent.join(format!(
        ".skill-control-install-{}-{}",
        destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("skill"),
        unix_millis()
    ));
    if temporary.exists() {
        fs::remove_dir_all(&temporary).map_err(|error| error.to_string())?;
    }
    fs::create_dir(&temporary).map_err(|error| error.to_string())?;
    if let Err(error) = fs::write(temporary.join("SKILL.md"), content) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error.to_string());
    }
    if let Err(error) = fs::rename(&temporary, destination) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error.to_string());
    }
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir(destination).map_err(|error| error.to_string())?;
    let entries = fs::read_dir(source).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        if file_type.is_symlink() {
            return Err(format!(
                "Cannot localize a skill containing the symlink {}. Review and copy it manually.",
                entry.path().to_string_lossy()
            ));
        }
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn copy_skill_atomically(source: &Path, destination: &Path) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or("Could not determine the target skills folder")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = parent.join(format!(
        ".skill-control-copy-{}-{}",
        destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("skill"),
        unix_millis()
    ));
    if temporary.exists() {
        fs::remove_dir_all(&temporary).map_err(|error| error.to_string())?;
    }
    if let Err(error) = copy_directory(source, &temporary) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    if let Err(error) = fs::rename(&temporary, destination) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
fn list_archives() -> Result<Vec<ArchiveEntry>, String> {
    let path = archive_database_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let database = open_archive_database(&path)?;
    let mut statement = database.prepare("SELECT id, skill_name, source_path, archive_path, created_at FROM archives ORDER BY created_at DESC").map_err(|error| error.to_string())?;
    let entries = statement
        .query_map([], |row| {
            Ok(ArchiveEntry {
                id: row.get(0)?,
                skill_name: row.get(1)?,
                source_path: row.get(2)?,
                archive_path: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;
    entries
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn scan_skills(projects: Vec<String>) -> ScanReport {
    let mut combined: HashMap<String, Skill> = HashMap::new();
    let mut findings = Vec::new();
    let candidates = agent_paths(&projects);
    let mut scanned_paths: Vec<String> = candidates
        .iter()
        .map(|candidate| candidate.path.to_string_lossy().to_string())
        .collect();
    scanned_paths.sort();
    scanned_paths.dedup();
    let projects = project_summaries(&candidates);
    let mut agents: Vec<String> = candidates
        .iter()
        .filter(|candidate| candidate.path.exists())
        .map(|candidate| candidate.agent.clone())
        .collect();
    agents.sort();
    agents.dedup();

    for candidate in &candidates {
        for (skill, mut skill_findings) in scan_candidate(candidate) {
            if let Some(existing) = combined.get_mut(&skill.id) {
                existing.installations.extend(skill.installations);
            } else {
                combined.insert(skill.id.clone(), skill);
            }
            findings.append(&mut skill_findings);
        }
    }

    for skill in combined.values_mut() {
        let unique_hashes: HashSet<String> = skill
            .installations
            .iter()
            .map(|installation| installation.source_hash.clone())
            .collect();
        if unique_hashes.len() > 1 {
            for installation in &mut skill.installations {
                installation.modified = true;
            }
            findings.push(Finding {
                id: format!("{}-divergent", skill.id),
                skill_id: skill.id.clone(),
                severity: "warning".into(),
                title: "Copies have diverged".into(),
                detail: "Installations with the same skill name contain different SKILL.md content. Review them before synchronizing or removing a copy."
                    .into(),
            });
        }

        for agent in ["codex", "claude"] {
            let has_user = skill
                .installations
                .iter()
                .any(|installation| installation.agent == agent && installation.scope == "user");
            let has_project = skill
                .installations
                .iter()
                .any(|installation| installation.agent == agent && installation.scope == "project");
            if has_user && has_project {
                findings.push(Finding {
                    id: format!("{}-{agent}-override", skill.id),
                    skill_id: skill.id.clone(),
                    severity: "info".into(),
                    title: "Global and project copies".into(),
                    detail: format!(
                        "{agent} can see both global and project-scoped copies. Prefer project scope unless the skill is useful everywhere."
                    ),
                });
            }
        }
    }

    let mut skills: Vec<Skill> = combined.into_values().collect();
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    ScanReport {
        skills,
        findings,
        scanned_paths,
        projects,
        agents,
        scanned_at: unix_seconds(),
    }
}

#[tauri::command]
fn preview_disable(installation: Installation) -> ChangePreview {
    let skill_name = Path::new(&installation.path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("skill");
    ChangePreview {
        title: format!("Disable {skill_name}"),
        changes: vec![format!(
            "Move {} to Skill Control's disabled archive",
            installation.path
        )],
        warnings: vec![
            "Only this exact installation will be removed. Other project or global copies remain active, and this copy can be restored later."
                .into(),
        ],
    }
}

#[tauri::command]
fn disable_skill(installation: Installation) -> Result<ArchiveEntry, String> {
    let home = dirs::home_dir().ok_or("Could not determine your home folder")?;
    let source = validate_installation(&installation, &home)?;
    let skill_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Could not determine the skill name")?
        .to_string();
    let id = format!("{}-{}", skill_name, unix_millis());
    let archive = disabled_archive_root()?.join(&id);
    fs::create_dir_all(
        archive
            .parent()
            .ok_or("Could not create the archive folder")?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(&source, &archive).map_err(|error| format!("Could not archive skill: {error}"))?;
    let entry = ArchiveEntry {
        id,
        skill_name,
        source_path: source.to_string_lossy().to_string(),
        archive_path: archive.to_string_lossy().to_string(),
        created_at: unix_seconds(),
    };
    if let Err(error) = record_archive(&entry) {
        let _ = fs::rename(&archive, &source);
        return Err(format!("Could not record the archive: {error}"));
    }
    Ok(entry)
}

#[tauri::command]
fn restore_skill(archive_id: String) -> Result<(), String> {
    let archive = archive_by_id(&archive_id)?;
    let source = PathBuf::from(&archive.source_path);
    let archived = PathBuf::from(&archive.archive_path);
    if !is_supported_restore_destination(&source) {
        return Err("The original destination is not a supported skill location.".into());
    }
    let archive_root = normalize_path(&disabled_archive_root()?);
    let normalized_archive = normalize_path(&archived);
    if !normalized_archive.starts_with(&archive_root) {
        return Err("The archive path is outside Skill Control's disabled folder.".into());
    }
    if source.exists() {
        return Err("A skill already exists at the original location. Move it before restoring this archive.".into());
    }
    if !archived.exists() {
        return Err("The archived copy no longer exists. It cannot be restored.".into());
    }
    fs::create_dir_all(
        source
            .parent()
            .ok_or("Could not determine the original skill folder")?,
    )
    .map_err(|error| error.to_string())?;
    fs::rename(&archived, &source).map_err(|error| format!("Could not restore skill: {error}"))?;
    if let Err(error) = remove_archive_record(&archive.id) {
        let _ = fs::rename(&source, &archived);
        return Err(format!("Could not update archive history: {error}"));
    }
    Ok(())
}

#[tauri::command]
fn copy_skill_to_project(
    installation: Installation,
    project_path: String,
) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Could not determine your home folder")?;
    let source = validate_installation(&installation, &home)?;
    let skill_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Could not determine the skill name")?;
    let target_root = skill_root(
        &home,
        "project",
        &installation.agent,
        Some(project_path.as_str()),
    )?;
    let destination = target_root.join(skill_name);
    if normalize_path(&source) == normalize_path(&destination) {
        return Err("This skill is already installed in the selected project.".into());
    }
    if destination.exists() {
        return Err(format!(
            "A skill named {skill_name} already exists at {}.",
            destination.to_string_lossy()
        ));
    }
    copy_skill_atomically(&source, &destination)?;
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
fn install_catalog_skill(
    skill_id: String,
    scope: String,
    target: String,
    project_path: Option<String>,
) -> Result<Vec<String>, String> {
    validate_skill_id(&skill_id)?;
    let (description, instructions) =
        catalog_definition(&skill_id).ok_or("Unknown catalog skill")?;
    let home = dirs::home_dir().ok_or("Could not determine your home folder")?;
    let agents = target_agents(&target)?;
    let destinations: Vec<PathBuf> = agents
        .iter()
        .map(|agent| {
            skill_root(&home, &scope, agent, project_path.as_deref())
                .map(|root| root.join(&skill_id))
        })
        .collect::<Result<Vec<_>, _>>()?;

    if let Some(existing) = destinations.iter().find(|destination| destination.exists()) {
        return Err(format!(
            "This skill already exists at {}. Inspect or disable that copy first.",
            existing.to_string_lossy()
        ));
    }

    let content = format!(
        "---\nname: {skill_id}\ndescription: {description}\nversion: 1.0.0\nsource: Skill Control curated library\n---\n\n# {skill_id}\n\n{instructions}\n"
    );
    let mut created = Vec::new();
    for destination in &destinations {
        if let Err(error) = write_skill_atomically(destination, &content) {
            for created_destination in &created {
                let _ = fs::remove_dir_all(created_destination);
            }
            return Err(format!("Could not install skill: {error}"));
        }
        created.push(destination.clone());
    }

    Ok(created
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_skills,
            preview_disable,
            disable_skill,
            restore_skill,
            list_archives,
            copy_skill_to_project,
            install_catalog_skill
        ])
        .run(tauri::generate_context!())
        .expect("error while running Skill Control")
}

#[cfg(test)]
mod tests {
    use super::{
        agent_paths, frontmatter, open_archive_database, skill_root, target_agents,
        validate_skill_id,
    };
    use std::{env, fs, path::Path};

    fn temporary_directory(label: &str) -> std::path::PathBuf {
        env::temp_dir().join(format!(
            "skill-control-{label}-{}-{}",
            std::process::id(),
            super::unix_millis()
        ))
    }

    #[test]
    fn parses_quoted_frontmatter_values() {
        let (values, complete) =
            frontmatter("---\nname: sample\ndescription: 'Useful skill'\n---\nBody");
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
        let path = temporary_directory("archive").with_extension("db");
        let database = open_archive_database(&path).expect("database should initialize");
        let table_exists: i32 = database
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='archives'",
                [],
                |row| row.get(0),
            )
            .expect("archives table should exist");
        assert_eq!(table_exists, 1);
        drop(database);
        fs::remove_file(path).expect("temporary database should clean up");
    }

    #[test]
    fn discovers_nested_project_skill_roots() {
        let workspace = temporary_directory("workspace");
        let project = workspace.join("nested-app");
        let skill = project.join(".agents/skills/example");
        fs::create_dir_all(&skill).expect("skill directory should be created");
        fs::write(project.join("package.json"), "{}").expect("project marker should be created");
        fs::write(
            skill.join("SKILL.md"),
            "---\nname: example\ndescription: Example\n---\n",
        )
        .expect("skill should be created");

        let normalized_project = super::normalize_path(&project);
        let candidates = agent_paths(&[workspace.to_string_lossy().to_string()]);
        assert!(candidates.iter().any(|candidate| {
            candidate.agent == "codex"
                && candidate.scope == "project"
                && candidate.project_path.as_deref() == Some(normalized_project.as_path())
                && candidate.path == normalized_project.join(".agents/skills")
        }));

        fs::remove_dir_all(workspace).expect("workspace should clean up");
    }

    #[test]
    fn discovers_nested_claude_scopes_without_project_markers() {
        let workspace = temporary_directory("claude-workspace");
        let package = workspace.join("packages/frontend");
        fs::create_dir_all(package.join(".claude/skills/review"))
            .expect("nested Claude skill should be created");
        fs::write(
            package.join(".claude/skills/review/SKILL.md"),
            "---\nname: review\ndescription: Review frontend changes\n---\n",
        )
        .expect("skill should be created");

        let normalized_package = super::normalize_path(&package);
        let candidates = agent_paths(&[workspace.to_string_lossy().to_string()]);
        assert!(candidates.iter().any(|candidate| {
            candidate.agent == "claude"
                && candidate.project_path.as_deref() == Some(normalized_package.as_path())
                && candidate.path == normalized_package.join(".claude/skills")
        }));

        fs::remove_dir_all(workspace).expect("workspace should clean up");
    }

    #[test]
    fn skips_generated_dependency_directories() {
        let workspace = temporary_directory("skip");
        let generated_project = workspace.join("node_modules/dependency");
        fs::create_dir_all(generated_project.join(".agents/skills/example"))
            .expect("generated skill should be created");
        fs::write(generated_project.join("package.json"), "{}")
            .expect("generated project marker should be created");

        let candidates = agent_paths(&[workspace.to_string_lossy().to_string()]);
        assert!(!candidates.iter().any(|candidate| {
            candidate
                .project_path
                .as_ref()
                .map(|path| path.starts_with(workspace.join("node_modules")))
                .unwrap_or(false)
        }));

        fs::remove_dir_all(workspace).expect("workspace should clean up");
    }

    #[test]
    fn builds_official_codex_project_target() {
        let home = Path::new("/tmp/home");
        let project = temporary_directory("project-target");
        fs::create_dir_all(&project).expect("project folder should be created");
        let target = skill_root(
            home,
            "project",
            "codex",
            Some(project.to_string_lossy().as_ref()),
        )
        .expect("project target should resolve");
        assert_eq!(
            target,
            super::normalize_path(&project).join(".agents/skills")
        );
        fs::remove_dir_all(project).expect("project folder should clean up");
    }

    #[test]
    fn builds_official_codex_user_target() {
        let home = Path::new("/tmp/home");
        let target = skill_root(home, "user", "codex", None).expect("user target should resolve");
        assert_eq!(target, Path::new("/tmp/home/.agents/skills"));
    }

    #[test]
    fn all_target_covers_both_supported_agents() {
        assert_eq!(target_agents("all").unwrap(), vec!["codex", "claude"]);
    }

    #[test]
    fn rejects_path_traversal_skill_ids() {
        assert!(validate_skill_id("../danger").is_err());
        assert!(validate_skill_id("safe-skill_2").is_ok());
    }

    #[test]
    fn hashes_resources_as_part_of_an_installation() {
        let skill = temporary_directory("hash");
        fs::create_dir_all(skill.join("references")).expect("resource folder should be created");
        fs::write(
            skill.join("SKILL.md"),
            concat!("---", "\nname: hash\n---\n"),
        )
        .expect("skill definition should be created");
        fs::write(skill.join("references/context.md"), "one").expect("resource should be created");

        let mut executable_scripts = Vec::new();
        let files = super::files_in(&skill, &skill, &mut executable_scripts);
        let first_hash = super::skill_hash(&skill, &files);
        fs::write(skill.join("references/context.md"), "two").expect("resource should be updated");
        let files = super::files_in(&skill, &skill, &mut executable_scripts);
        let second_hash = super::skill_hash(&skill, &files);

        assert_ne!(first_hash, second_hash);
        fs::remove_dir_all(skill).expect("skill folder should clean up");
    }
}
