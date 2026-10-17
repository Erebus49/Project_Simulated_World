from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Action(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["move", "observe", "speak", "take", "give", "interact", "wait"]
    target_id: str | None = Field(default=None, max_length=64)
    item_id: str | None = Field(default=None, max_length=64)
    interaction: Literal["unlock_stage", "inspect_stage", "install_speaker", "allocate_stall", "interview", "read_notice", "read_ledger", "open_locker", "mute_broadcast", "seal_slip", "cut_power", "play_music", "answer_voice", "leave_town", "read_trail", "inspect_garden"] | None = None
    code: str | None = Field(default=None, pattern=r"^\d{3}$")
    message: str = Field(default="", max_length=800)
    private: bool = False
    related_event_ids: list[int] = Field(default_factory=list, max_length=12)
    intent_summary: str = Field(default="", max_length=160)

    @model_validator(mode="after")
    def required_fields(self):
        if self.action in {"move", "speak", "give"} and not self.target_id:
            raise ValueError("这个行动需要目标")
        if self.action in {"take", "give"} and not self.item_id:
            raise ValueError("这个行动需要物品")
        if self.action == "speak" and not self.message.strip():
            raise ValueError("说话内容不能为空")
        if self.action == "interact" and not self.interaction:
            raise ValueError("需要选择已注册的交互")
        return self


class ActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(min_length=8, max_length=80)
    action: Action


class NewGame(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["demo", "ai"] = "demo"
    max_turns: Literal[12, 18, 24] = 18
    goals: dict[str, str] = Field(default_factory=dict)
    scenario_id: Literal["night", "festival"] = "night"


class WalkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float = Field(ge=0, le=768, allow_inf_nan=False)
    y: float = Field(ge=0, le=480, allow_inf_nan=False)


class PulseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    talking_to: Literal["mayor", "caretaker", "shopkeeper", "reporter"] | None = None


class ModelSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    base_url: str = Field(default="https://api.openai.com/v1", max_length=500)
    model: str = Field(default="", max_length=150)
    api_key: str = Field(default="", max_length=2000)
    timeout_seconds: int = Field(default=10, ge=3, le=45)
